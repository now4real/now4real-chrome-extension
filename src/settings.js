const DEFAULT_SETTINGS = {
  now4realEnabled: false,
  widgetPosition: 'left',
  demoMode: true
};
const DEFAULT_WIDGET_COLORS = {
  background: '#39aae1',
  text: '#ffffff'
};

const now4realEnabledInput = document.querySelector('#now4realEnabled');
const widgetStateText = document.querySelector('#widgetStateText');
const positionInputs = document.querySelectorAll('input[name="widgetPosition"]');
const widgetPositionSetting = document.querySelector('#widgetPositionSetting');
const widgetColorSetting = document.querySelector('#widgetColorSetting');
const widgetColorInputs = document.querySelectorAll('input[data-widget-color]');
const widgetColorValues = document.querySelectorAll('[data-widget-color-value]');
const resetWidgetColorsButton = document.querySelector('#resetWidgetColors');
const demoModeInput = document.querySelector('#demoMode');
const loadWarningEl = document.querySelector('#loadWarning');
const statusEl = document.querySelector('#status');

const LOAD_WARNING_MESSAGE = 'Now4real could not load on this site because the site blocks third-party scripts.';
const LOAD_STATUS_MESSAGES = {
  blocked: LOAD_WARNING_MESSAGE,
  'site-existing': 'Now4real is already provided by this site. The extension did not inject it.'
};

let currentHost = '';

function getWidgetColorsKey() {
  return `now4realWidgetColors:${currentHost}`;
}

function normalizeWidgetColors(colors) {
  return Object.fromEntries(Object.entries(DEFAULT_WIDGET_COLORS).map(([name, defaultValue]) => {
    const legacyName = name === 'background' ? 'color_external_background' : 'color_external_text';
    const value = colors && (colors[name] || colors[legacyName]);
    return [name, /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : defaultValue];
  }));
}

function hasCustomWidgetColors(colors) {
  const normalizedColors = normalizeWidgetColors(colors);
  return Object.keys(DEFAULT_WIDGET_COLORS).some((name) => (
    normalizedColors[name] !== DEFAULT_WIDGET_COLORS[name]
  ));
}

function normalizeSettings(settings) {
  return {
    now4realEnabled: Boolean(settings.now4realEnabled),
    widgetPosition: settings.widgetPosition === 'right' ? 'right' : 'left',
    demoMode: settings.demoMode !== false
  };
}

function setStatus(message) {
  statusEl.textContent = message;
  window.clearTimeout(setStatus.timeoutId);
  setStatus.timeoutId = window.setTimeout(() => {
    statusEl.textContent = '';
  }, 1800);
}

function render(settings) {
  const normalizedSettings = normalizeSettings(settings);

  now4realEnabledInput.checked = normalizedSettings.now4realEnabled;
  widgetStateText.textContent = normalizedSettings.now4realEnabled
    ? 'Widget enabled on all sites.'
    : 'Widget disabled on all sites.';

  positionInputs.forEach((input) => {
    input.checked = input.value === normalizedSettings.widgetPosition;
  });

  demoModeInput.checked = normalizedSettings.demoMode;
  document.body.dataset.demoMode = normalizedSettings.demoMode;
  widgetPositionSetting.hidden = !normalizedSettings.demoMode;
  widgetColorSetting.hidden = !normalizedSettings.demoMode;
}

function renderWidgetColors(colors) {
  const normalizedColors = normalizeWidgetColors(colors);
  widgetColorInputs.forEach((input) => {
    input.value = normalizedColors[input.dataset.widgetColor];
  });
  widgetColorValues.forEach((value) => {
    value.value = normalizedColors[value.dataset.widgetColorValue].toUpperCase();
  });
  resetWidgetColorsButton.hidden = !hasCustomWidgetColors(colors);
}

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function getHostFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }

    return normalizeHost(parsedUrl.hostname);
  } catch (error) {
    return '';
  }
}

function getLoadStatusKey() {
  return `now4realLoadStatus:${currentHost}`;
}

async function getStoredLoadStatus() {
  const key = getLoadStatusKey();
  const storedValue = await chrome.storage.local.get(key);
  return storedValue[key];
}

async function renderLoadStatus() {
  if (!loadWarningEl || !currentHost) {
    return;
  }

  const loadStatus = await getStoredLoadStatus();

  const shouldShowStatus = loadStatus && ['blocked', 'site-existing'].includes(loadStatus.status);
  loadWarningEl.hidden = !shouldShowStatus;
  loadWarningEl.dataset.state = loadStatus ? loadStatus.status : '';
  loadWarningEl.textContent = shouldShowStatus
    ? (loadStatus.message || LOAD_STATUS_MESSAGES[loadStatus.status] || '')
    : '';
}

async function saveSettings() {
  const checkedPosition = document.querySelector('input[name="widgetPosition"]:checked');
  const settings = normalizeSettings({
    now4realEnabled: now4realEnabledInput.checked,
    widgetPosition: checkedPosition ? checkedPosition.value : DEFAULT_SETTINGS.widgetPosition,
    demoMode: demoModeInput.checked
  });

  await chrome.storage.sync.set(settings);
  await chrome.runtime.sendMessage({
    type: 'now4real:update-action-icon',
    now4realEnabled: settings.now4realEnabled
  });
  render(settings);
  await refreshCurrentTab();
  setStatus('Settings saved. Current tab refreshed.');
}

async function saveWidgetColors() {
  if (!currentHost) {
    return;
  }

  const colors = Object.fromEntries(Array.from(widgetColorInputs, (input) => [
    input.dataset.widgetColor,
    input.value
  ]));
  await chrome.storage.sync.set({ [getWidgetColorsKey()]: normalizeWidgetColors(colors) });
  resetWidgetColorsButton.hidden = false;
  await refreshCurrentTab();
  setStatus('Widget colors saved. Current tab refreshed.');
}

async function resetWidgetColors() {
  if (!currentHost) {
    return;
  }

  await chrome.storage.sync.remove(getWidgetColorsKey());
  renderWidgetColors(DEFAULT_WIDGET_COLORS);
  await refreshCurrentTab();
  setStatus('Default widget colors restored. Current tab refreshed.');
}

async function refreshCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !Number.isInteger(tab.id) || !tab.url || tab.url.startsWith('chrome://')) {
    return;
  }

  try {
    await chrome.tabs.reload(tab.id);
  } catch (error) {
    console.warn('Unable to refresh the current tab.', error);
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHost = tab && tab.url ? getHostFromUrl(tab.url) : '';

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);
  if (currentHost) {
    const storedColors = await chrome.storage.sync.get(getWidgetColorsKey());
    renderWidgetColors(storedColors[getWidgetColorsKey()]);
  } else {
    renderWidgetColors(DEFAULT_WIDGET_COLORS);
  }
  await renderLoadStatus();

  now4realEnabledInput.addEventListener('change', saveSettings);
  positionInputs.forEach((input) => {
    input.addEventListener('change', saveSettings);
  });
  demoModeInput.addEventListener('change', saveSettings);
  widgetColorInputs.forEach((input) => input.addEventListener('change', saveWidgetColors));
  resetWidgetColorsButton.addEventListener('click', resetWidgetColors);
}

init();
