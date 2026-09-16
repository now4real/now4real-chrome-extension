const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';
const NATIVE_SCRIPT_MESSAGE = 'Now4real is already provided by this site. The extension did not inject it.';
const NOW4REAL_SCRIPT_URL = 'https://cdn.now4real.com/now4real.js';
const NOW4REAL_SCRIPT_ORIGIN = new URL(NOW4REAL_SCRIPT_URL).origin;
const NOW4REAL_SCRIPT_ENDPOINTS = [
  { protocol: 'https:', hostname: 'cdn.now4real.com', port: '', pathname: '/now4real.js' },
  { protocol: 'https:', hostname: 'cdn.staging.now4real.com', port: '', pathname: '/now4real.js' },
  { protocol: 'http:', hostname: 'localhost.cdn.localtest.me', port: '3000', pathname: '/now4real.js' }
];
const tabCspVerdicts = new Map();
const ACTION_ICONS = {
  active: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  },
  inactive: {
    16: 'icons/icon16-disabled.png',
    32: 'icons/icon32-disabled.png',
    48: 'icons/icon48-disabled.png',
    128: 'icons/icon128-disabled.png'
  }
};

async function setActionIcon(now4realEnabled, tabId) {
  const paths = now4realEnabled ? ACTION_ICONS.active : ACTION_ICONS.inactive;
  const imageDataEntries = await Promise.all(Object.entries(paths).map(async ([size, path]) => {
    const response = await fetch(chrome.runtime.getURL(path));

    if (!response.ok) {
      throw new Error(`Unable to load action icon: ${path}`);
    }

    const bitmap = await createImageBitmap(await response.blob());
    const dimension = Number(size);
    const canvas = new OffscreenCanvas(dimension, dimension);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, dimension, dimension);
    bitmap.close();

    return [size, context.getImageData(0, 0, dimension, dimension)];
  }));

  await chrome.action.setIcon({
    imageData: Object.fromEntries(imageDataEntries),
    ...(Number.isInteger(tabId) ? { tabId } : {})
  });
}

async function updateActionIconForTab(tab) {
  if (!tab || !Number.isInteger(tab.id)) {
    return;
  }

  let host = '';
  try {
    host = normalizeHost(new URL(tab.url || '').hostname);
  } catch (error) {
    // Unsupported URLs keep the extension's default inactive icon.
  }

  const key = `now4realEnabled:${host}`;
  const settings = host ? await chrome.storage.sync.get({ [key]: false }) : {};
  await setActionIcon(Boolean(settings[key]), tab.id);
}

async function updateActionIconForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await updateActionIconForTab(tab);
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function getLoadStatusKey(host) {
  return `now4realLoadStatus:${normalizeHost(host)}`;
}

function isNow4realScriptUrl(scriptUrl) {
  try {
    const url = new URL(scriptUrl);
    return NOW4REAL_SCRIPT_ENDPOINTS.some((endpoint) => (
      url.protocol === endpoint.protocol
      && url.hostname === endpoint.hostname
      && url.port === endpoint.port
      && url.pathname === endpoint.pathname
    ));
  } catch (error) {
    return false;
  }
}

function getHeaderValue(headers, name) {
  const targetName = String(name || '').toLowerCase();
  const header = (headers || []).find((entry) => (
    entry && typeof entry.name === 'string' && entry.name.toLowerCase() === targetName
  ));

  return header && typeof header.value === 'string' ? header.value : '';
}

function getDirectiveSources(policy, directiveName) {
  const directive = String(policy || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.toLowerCase().startsWith(`${directiveName} `) || chunk.toLowerCase() === directiveName);

  if (!directive) {
    return null;
  }

  return directive
    .split(/\s+/)
    .slice(1)
    .filter(Boolean);
}

function getScriptSources(policy) {
  return getDirectiveSources(policy, 'script-src-elem')
    || getDirectiveSources(policy, 'script-src')
    || getDirectiveSources(policy, 'default-src');
}

function hasNonceOrHashSource(sources) {
  return sources.some((source) => (
    /^'nonce-[^']+'$/i.test(source) || /^'(sha256|sha384|sha512)-[^']+'$/i.test(source)
  ));
}

function sourceAllowsNow4real(source) {
  if (!source) {
    return false;
  }

  const now4realUrl = new URL(NOW4REAL_SCRIPT_URL);

  if (source === '*' || source === now4realUrl.protocol) {
    return true;
  }

  if (source.startsWith(`${now4realUrl.protocol}//`)) {
    if (source === NOW4REAL_SCRIPT_ORIGIN || source === NOW4REAL_SCRIPT_URL) {
      return true;
    }

    if (source.startsWith(`${now4realUrl.protocol}//*.`)) {
      const wildcardHost = source.slice(`${now4realUrl.protocol}//*.`.length);
      return now4realUrl.hostname.endsWith(`.${wildcardHost}`);
    }

    try {
      return new URL(source).origin === NOW4REAL_SCRIPT_ORIGIN;
    } catch (error) {
      return false;
    }
  }

  if (source.startsWith('*.')) {
    const wildcardHost = source.slice(2);
    return now4realUrl.hostname.endsWith(`.${wildcardHost}`);
  }

  return false;
}

function policyBlocksNow4real(policy) {
  const scriptSources = getScriptSources(policy);

  if (!scriptSources || scriptSources.length === 0) {
    return false;
  }

  if (scriptSources.includes("'strict-dynamic'")) {
    return true;
  }

  if (scriptSources.includes("'none'")) {
    return true;
  }

  if (scriptSources.some(sourceAllowsNow4real)) {
    return false;
  }

  return hasNonceOrHashSource(scriptSources) || true;
}

async function setBlockedStatus(host) {
  if (!host) {
    return;
  }

  await chrome.storage.local.set({
    [getLoadStatusKey(host)]: {
      status: 'blocked',
      message: LOAD_WARNING_MESSAGE,
      updatedAt: Date.now()
    }
  });
}

async function setSiteExistingStatus(host) {
  if (!host) {
    return;
  }

  await chrome.storage.local.set({
    [getLoadStatusKey(host)]: {
      status: 'site-existing',
      message: NATIVE_SCRIPT_MESSAGE,
      updatedAt: Date.now()
    }
  });
}

async function clearAllowedStatus(host) {
  if (!host) {
    return;
  }

  const key = getLoadStatusKey(host);
  await chrome.storage.local.remove(key);
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    let parsedUrl;

    try {
      parsedUrl = new URL(details.url);
    } catch (error) {
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return;
    }

    const policy = getHeaderValue(details.responseHeaders, 'content-security-policy');
    const responseContentType = getHeaderValue(details.responseHeaders, 'content-type')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    const host = normalizeHost(parsedUrl.hostname);
    const tabId = Number.isInteger(details.tabId) ? details.tabId : -1;

    if (!policy) {
      if (tabId >= 0) {
        tabCspVerdicts.set(tabId, { blocked: false, host, known: false, responseContentType });
      }

      void clearAllowedStatus(host);
      return;
    }

    if (policyBlocksNow4real(policy)) {
      if (tabId >= 0) {
        tabCspVerdicts.set(tabId, { blocked: true, host, known: true, responseContentType });
      }

      void setBlockedStatus(host);
      return;
    }

    if (tabId >= 0) {
      tabCspVerdicts.set(tabId, { blocked: false, host, known: true, responseContentType });
    }

    void clearAllowedStatus(host);
  },
  {
    urls: ['<all_urls>'],
    types: ['main_frame']
  },
  ['responseHeaders', 'extraHeaders']
);

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0 || !isNow4realScriptUrl(details.url)) {
      return;
    }

    let host = '';
    try {
      host = normalizeHost(new URL(details.documentUrl || details.initiator || '').hostname);
    } catch (error) {
      return;
    }

    void setSiteExistingStatus(host);
  },
  {
    urls: [
      '*://cdn.now4real.com/*',
      '*://cdn.staging.now4real.com/*',
      'http://localhost.cdn.localtest.me/*'
    ],
    types: ['script']
  }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCspVerdicts.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void updateActionIconForActiveTab();
});

chrome.runtime.onStartup.addListener(() => {
  void updateActionIconForActiveTab();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && Object.keys(changes).some((key) => key.startsWith('now4realEnabled:'))) {
    void updateActionIconForActiveTab();
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then(updateActionIconForTab)
    .catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    void updateActionIconForTab(tab);
  }
});

void updateActionIconForActiveTab();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'now4real:update-action-icon') {
    updateActionIconForActiveTab()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: String(error) }));
    return true;
  }

  if (!message || message.type !== 'now4real:get-csp-verdict') {
    return false;
  }

  const tabId = sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : -1;
  const verdict = tabId >= 0 ? tabCspVerdicts.get(tabId) : null;

  sendResponse(verdict || { blocked: false, known: false, host: '', responseContentType: '' });
  return false;
});