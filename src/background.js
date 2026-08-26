const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';
const NOW4REAL_SCRIPT_URL = 'https://cdn.staging.now4real.com/now4real.js';
const NOW4REAL_SCRIPT_ORIGIN = new URL(NOW4REAL_SCRIPT_URL).origin;
const tabCspVerdicts = new Map();

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function getLoadStatusKey(host) {
  return `now4realLoadStatus:${normalizeHost(host)}`;
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
    const host = normalizeHost(parsedUrl.hostname);
    const tabId = Number.isInteger(details.tabId) ? details.tabId : -1;

    if (!policy) {
      if (tabId >= 0) {
        tabCspVerdicts.set(tabId, { blocked: false, host, known: false });
      }

      void clearAllowedStatus(host);
      return;
    }

    if (policyBlocksNow4real(policy)) {
      if (tabId >= 0) {
        tabCspVerdicts.set(tabId, { blocked: true, host, known: true });
      }

      void setBlockedStatus(host);
      return;
    }

    if (tabId >= 0) {
      tabCspVerdicts.set(tabId, { blocked: false, host, known: true });
    }

    void clearAllowedStatus(host);
  },
  {
    urls: ['<all_urls>'],
    types: ['main_frame']
  },
  ['responseHeaders', 'extraHeaders']
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCspVerdicts.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'now4real:get-csp-verdict') {
    return false;
  }

  const tabId = sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : -1;
  const verdict = tabId >= 0 ? tabCspVerdicts.get(tabId) : null;

  sendResponse(verdict || { blocked: false, known: false, host: '' });
  return false;
});