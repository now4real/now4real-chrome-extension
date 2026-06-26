(() => {
  const CDN_SCRIPT_ID = 'now4real-cdn-script';
  const SETTINGS_EVENT = 'now4real-extension-settings';
  const NOW4REAL_SCRIPT_URL = 'https://cdn.staging.now4real.com/now4real.js';

  let loadRequested = false;

  function normalizeSettings(settings) {
    return {
      widgetPosition: settings && settings.widgetPosition === 'right' ? 'right' : 'left',
      demoMode: Boolean(settings && settings.demoMode)
    };
  }

  function buildConfig(settings) {
    return {
      target: settings.demoMode ? 'demo' : 'widget',
      widget: {
        align: settings.widgetPosition,
        align_mobile: settings.widgetPosition
      }
    };
  }

  function applyConfig(settings) {
    window.now4real = window.now4real || {};
    window.now4real.config = buildConfig(settings);
  }

  function loadNow4real() {
    if (loadRequested || document.getElementById(CDN_SCRIPT_ID)) {
      return;
    }

    loadRequested = true;
    const script = document.createElement('script');
    script.id = CDN_SCRIPT_ID;
    script.type = 'text/javascript';
    script.async = true;
    script.src = NOW4REAL_SCRIPT_URL;
    (document.head || document.documentElement).appendChild(script);
  }

  function update(settings) {
    const currentSettings = normalizeSettings(settings);
    applyConfig(currentSettings);
    loadNow4real();
  }

  window.addEventListener(SETTINGS_EVENT, (event) => {
    update(event.detail);
  });
})();
