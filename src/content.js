const DEFAULT_SETTINGS = {
  now4realEnabled: true,
  widgetPosition: 'left',
  demoMode: false
};

const BRIDGE_SCRIPT_ID = 'now4real-extension-page-bridge';
const SETTINGS_EVENT = 'now4real-extension-settings';
const LOAD_STATUS_EVENT = 'now4real-extension-load-status';
const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';

function normalizeSettings(settings) {
  return {
    now4realEnabled: settings.now4realEnabled !== false,
    widgetPosition: settings.widgetPosition === 'right' ? 'right' : 'left',
    demoMode: Boolean(settings.demoMode)
  };
}

function dispatchSettings(settings) {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {
    detail: normalizeSettings(settings)
  }));
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function getLoadStatusKey() {
  return `now4realLoadStatus:${normalizeHost(window.location.hostname)}`;
}

async function handleLoadStatus(status) {
  if (status === 'blocked') {
    await chrome.storage.local.set({
      [getLoadStatusKey()]: {
        status: 'blocked',
        message: LOAD_WARNING_MESSAGE,
        updatedAt: Date.now()
      }
    });
    return;
  }

  if (status === 'loaded') {
    await chrome.storage.local.remove(getLoadStatusKey());
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

  await injectBridge();
  dispatchSettings(settings);
}

window.addEventListener(LOAD_STATUS_EVENT, (event) => {
  handleLoadStatus(event.detail && event.detail.status);
});

init();
