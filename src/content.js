const DEFAULT_SETTINGS = {
  now4realEnabled: true,
  widgetPosition: 'left',
  demoMode: false
};

const BRIDGE_SCRIPT_ID = 'now4real-extension-page-bridge';
const SETTINGS_EVENT = 'now4real-extension-settings';
const LOAD_STATUS_EVENT = 'now4real-extension-load-status';
const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';
const NOW4REAL_SCRIPT_URL = 'https://cdn.staging.now4real.com/now4real.js';
const NOW4REAL_SCRIPT_ORIGIN = new URL(NOW4REAL_SCRIPT_URL).origin;
const NOW4REAL_SOURCE = `now4real-chrome-extension/${chrome.runtime.getManifest().version}`;

function normalizeSettings(settings) {
  return {
    now4realEnabled: settings.now4realEnabled !== false,
    widgetPosition: settings.widgetPosition === 'right' ? 'right' : 'left',
    demoMode: Boolean(settings.demoMode)
  };
}

function dispatchSettings(settings) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {
    detail: {
      ...normalizeSettings(settings),
      source: NOW4REAL_SOURCE
    }
  }));
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function getLoadStatusKey() {
  return `now4realLoadStatus:${normalizeHost(window.location.hostname)}`;
}

async function getStoredLoadStatus() {
  const key = getLoadStatusKey();
  const storedValue = await chrome.storage.local.get(key);
  return storedValue[key];
}

async function setBlockedStatus() {
  await chrome.storage.local.set({
    [getLoadStatusKey()]: {
      status: 'blocked',
      message: LOAD_WARNING_MESSAGE,
      updatedAt: Date.now()
    }
  });
}

async function clearLoadStatus() {
  await chrome.storage.local.remove(getLoadStatusKey());
}

function getHeaderValueFromPolicy(policy, directiveName) {
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
  return getHeaderValueFromPolicy(policy, 'script-src-elem')
    || getHeaderValueFromPolicy(policy, 'script-src')
    || getHeaderValueFromPolicy(policy, 'default-src');
}

function sourceAllowsNow4real(source) {
  if (!source) {
    return false;
  }

  if (source === '*' || source === 'https:') {
    return true;
  }

  if (source.startsWith('https://')) {
    if (source === NOW4REAL_SCRIPT_ORIGIN || source === NOW4REAL_SCRIPT_URL) {
      return true;
    }

    if (source.startsWith('https://*.')) {
      const wildcardHost = source.slice('https://*.'.length);
      return new URL(NOW4REAL_SCRIPT_URL).hostname.endsWith(`.${wildcardHost}`);
    }
  }

  if (source.startsWith('*.')) {
    const wildcardHost = source.slice(2);
    return new URL(NOW4REAL_SCRIPT_URL).hostname.endsWith(`.${wildcardHost}`);
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

  return true;
}

function getMetaCspPolicies() {
  return Array.from(document.querySelectorAll('meta[http-equiv]'))
    .filter((meta) => meta.getAttribute('http-equiv') && meta.getAttribute('http-equiv').toLowerCase() === 'content-security-policy')
    .map((meta) => meta.getAttribute('content') || '')
    .filter(Boolean);
}

async function shouldSkipInjection() {
  if (getMetaCspPolicies().some(policyBlocksNow4real)) {
    await setBlockedStatus();
    return true;
  }

  try {
    const verdict = await chrome.runtime.sendMessage({ type: 'now4real:get-csp-verdict' });

    if (verdict && verdict.blocked) {
      await setBlockedStatus();
      return true;
    }

    if (verdict && verdict.known) {
      await clearLoadStatus();
    }
  } catch (error) {
    console.warn('Unable to read the page CSP verdict from the extension worker.', error);
  }

  return false;
}

async function handleLoadStatus(status) {
  if (status === 'blocked') {
    await setBlockedStatus();
    return;
  }

  if (status === 'loaded') {
    await clearLoadStatus();
  }
}

function injectBridge() {
  if (document.getElementById(BRIDGE_SCRIPT_ID)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.id = BRIDGE_SCRIPT_ID;
    script.src = chrome.runtime.getURL('src/page-bridge.js');
    script.async = false;
    script.addEventListener('load', resolve, { once: true });
    (document.head || document.documentElement).appendChild(script);
  });
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return normalizeSettings(settings);
}

async function init() {
  if (!document.documentElement) {
    return;
  }

  const settings = await loadSettings();
  if (!settings.now4realEnabled) {
    return;
  }

  if (await shouldSkipInjection()) {
    return;
  }

  await injectBridge();
  dispatchSettings(settings);
}

window.addEventListener(LOAD_STATUS_EVENT, (event) => {
  handleLoadStatus(event.detail && event.detail.status);
});

init();
