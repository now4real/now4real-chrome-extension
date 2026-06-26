const DEFAULT_SETTINGS = {
  now4realEnabled: true,
  widgetPosition: 'left',
  demoMode: false
};

const now4realEnabledInput = document.querySelector('#now4realEnabled');
const widgetStateText = document.querySelector('#widgetStateText');
const positionInputs = document.querySelectorAll('input[name="widgetPosition"]');
const demoModeInput = document.querySelector('#demoMode');
const statusEl = document.querySelector('#status');

function normalizeSettings(settings) {
  return {
    now4realEnabled: settings.now4realEnabled !== false,
    widgetPosition: settings.widgetPosition === 'right' ? 'right' : 'left',
    demoMode: Boolean(settings.demoMode)
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
    ? 'Widget active on all sites.'
    : 'Widget disabled on all sites.';

  positionInputs.forEach((input) => {
    input.checked = input.value === normalizedSettings.widgetPosition;
  });

  demoModeInput.checked = normalizedSettings.demoMode;
}

async function saveSettings() {
  const checkedPosition = document.querySelector('input[name="widgetPosition"]:checked');
  const settings = normalizeSettings({
    now4realEnabled: now4realEnabledInput.checked,
    widgetPosition: checkedPosition ? checkedPosition.value : DEFAULT_SETTINGS.widgetPosition,
    demoMode: demoModeInput.checked
  });

  await chrome.storage.sync.set(settings);
  render(settings);
  await refreshCurrentTab();
  setStatus('Settings saved. Current tab refreshed.');
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
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);

  now4realEnabledInput.addEventListener('change', saveSettings);
  positionInputs.forEach((input) => {
    input.addEventListener('change', saveSettings);
  });
  demoModeInput.addEventListener('change', saveSettings);
}

init();
