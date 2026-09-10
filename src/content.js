const DEFAULT_SETTINGS = {
  now4realEnabled: false,
  widgetPosition: 'left',
  demoMode: true
};

const BRIDGE_SCRIPT_ID = 'now4real-extension-page-bridge';
const SETTINGS_EVENT = 'now4real-extension-settings';
const LOAD_STATUS_EVENT = 'now4real-extension-load-status';
const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';
const NATIVE_SCRIPT_MESSAGE = 'Now4real is already provided by this site; the extension did not load another instance.';
const NOW4REAL_SCRIPT_URL = 'https://cdn.now4real.com/now4real.js';
const NOW4REAL_SCRIPT_ORIGIN = new URL(NOW4REAL_SCRIPT_URL).origin;
const NOW4REAL_SOURCE = `now4real-chrome-extension/${chrome.runtime.getManifest().version}`;
const NATIVE_SCRIPT_DETECTION_DELAY_MS = 2000;
const NOW4REAL_SCRIPT_ENDPOINTS = [
  { protocol: 'https:', hostname: 'cdn.now4real.com', port: '', pathname: '/now4real.js' },
  { protocol: 'https:', hostname: 'cdn.staging.now4real.com', port: '', pathname: '/now4real.js' },
  { protocol: 'http:', hostname: 'localhost.cdn.localtest.me', port: '3000', pathname: '/now4real.js' }
];

function normalizeSettings(settings) {
  return {
    now4realEnabled: Boolean(settings.now4realEnabled),
    widgetPosition: settings.widgetPosition === 'right' ? 'right' : 'left',
    demoMode: settings.demoMode !== false,
    widgetColors: normalizeWidgetColors(settings.widgetColors)
  };
}

function normalizeWidgetColors(colors) {
  const background = colors && (colors.background || colors.color_external_background);
  const text = colors && (colors.text || colors.color_external_text);

  return {
    ...( /^#[0-9a-f]{6}$/i.test(background) ? { background: background.toLowerCase() } : {}),
    ...( /^#[0-9a-f]{6}$/i.test(text) ? { text: text.toLowerCase() } : {})
  };
}

function isSupportedHtmlDocument() {
  const contentType = String(document.contentType || '').split(';', 1)[0].trim().toLowerCase();
  const root = document.documentElement;

  return contentType === 'text/html'
    && root
    && root.localName === 'html'
    && root.namespaceURI === 'http://www.w3.org/1999/xhtml';
}

async function hasSupportedResponseContentType() {
  try {
    const verdict = await chrome.runtime.sendMessage({ type: 'now4real:get-csp-verdict' });
    const responseContentType = String(verdict && verdict.responseContentType || '').toLowerCase();

    return !responseContentType || responseContentType === 'text/html';
  } catch (error) {
    console.warn('Unable to read the main-frame response content type from the extension worker.', error);
    return true;
  }
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
  await setLoadStatus('blocked', LOAD_WARNING_MESSAGE);
}

async function setLoadStatus(status, message) {
  await chrome.storage.local.set({
    [getLoadStatusKey()]: {
      status,
      message,
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

  return true;
}

function getMetaCspPolicies() {
  return Array.from(document.querySelectorAll('meta[http-equiv]'))
    .filter((meta) => meta.getAttribute('http-equiv') && meta.getAttribute('http-equiv').toLowerCase() === 'content-security-policy')
    .map((meta) => meta.getAttribute('content') || '')
    .filter(Boolean);
}

function isNow4realScriptUrl(scriptUrl) {
  try {
    const url = new URL(scriptUrl, document.baseURI);
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

function hasNativeNow4realScript() {
  return Array.from(document.querySelectorAll('script[src]')).some((script) => (
    isNow4realScriptUrl(script.getAttribute('src') || script.src)
  ));
}

function waitForNativeNow4realScript() {
  if (hasNativeNow4realScript()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      const scriptAdded = mutations.some((mutation) => (
        Array.from(mutation.addedNodes).some((node) => (
          node.nodeType === Node.ELEMENT_NODE
          && (
            (node.matches && node.matches('script[src]') && isNow4realScriptUrl(node.getAttribute('src') || node.src))
            || (node.querySelector && Array.from(node.querySelectorAll('script[src]')).some((script) => (
              isNow4realScriptUrl(script.getAttribute('src') || script.src)
            )))
          )
        ))
      ));

      if (scriptAdded) {
        observer.disconnect();
        window.clearTimeout(timeoutId);
        resolve(true);
      }
    });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      resolve(hasNativeNow4realScript());
    }, NATIVE_SCRIPT_DETECTION_DELAY_MS);

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
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
  if (status === 'site-existing') {
    await setLoadStatus('site-existing', NATIVE_SCRIPT_MESSAGE);
    return;
  }

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
  const host = normalizeHost(window.location.hostname);
  const colorKey = `now4realWidgetColors:${host}`;
  const storedColors = host ? await chrome.storage.sync.get(colorKey) : {};
  return normalizeSettings({ ...settings, widgetColors: storedColors[colorKey] });
}

async function init() {
  if (!isSupportedHtmlDocument()) {
    return;
  }

  const settings = await loadSettings();
  if (!settings.now4realEnabled) {
    return;
  }

  if (!await hasSupportedResponseContentType()) {
    return;
  }

  if (await waitForNativeNow4realScript()) {
    await setLoadStatus('site-existing', NATIVE_SCRIPT_MESSAGE);
    console.info('Now4real extension skipped injection because an existing Now4real script was found on this page.');
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
