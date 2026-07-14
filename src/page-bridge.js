(() => {
  const CDN_SCRIPT_ID = 'now4real-cdn-script';
  const SETTINGS_EVENT = 'now4real-extension-settings';
  const LOAD_STATUS_EVENT = 'now4real-extension-load-status';
  const NOW4REAL_SCRIPT_URL = 'https://cdn.staging.now4real.com/now4real.js';

  let loadRequested = false;

  function normalizeSettings(settings) {
    return {
      widgetPosition: settings && settings.widgetPosition === 'right' ? 'right' : 'left',
      demoMode: Boolean(settings && settings.demoMode),
      source: typeof (settings && settings.source) === 'string'
        ? settings.source
        : 'now4real-chrome-extension/unknown'
    };
  }

  function buildConfig(settings) {
    return {
      target: settings.demoMode ? 'demo' : 'widget',
      source: settings.source,
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

  function hasNow4realScript() {
    return Array.from(document.querySelectorAll('script[src]')).some((script) => (
      script.src === NOW4REAL_SCRIPT_URL || script.getAttribute('src') === NOW4REAL_SCRIPT_URL
    ));
  }

  function createTrustedScriptUrl(url) {
    if (!window.trustedTypes) {
      return url;
    }

    const policy = window.trustedTypes.createPolicy('now4real-extension', {
      createScriptURL: (scriptUrl) => scriptUrl
    });

    return policy.createScriptURL(url);
  }

  function dispatchLoadStatus(status) {
    window.dispatchEvent(new CustomEvent(LOAD_STATUS_EVENT, {
      detail: { status }
    }));
  }

  function loadNow4real() {
    if (loadRequested || document.getElementById(CDN_SCRIPT_ID) || hasNow4realScript()) {
      return;
    }

    loadRequested = true;
    const script = document.createElement('script');
    script.id = CDN_SCRIPT_ID;
    script.type = 'text/javascript';
    script.async = true;

    try {
      script.src = createTrustedScriptUrl(NOW4REAL_SCRIPT_URL);
    } catch (error) {
      loadRequested = false;
      dispatchLoadStatus('blocked');
      console.warn('Now4real script injection was blocked by the page Trusted Types policy.', error);
      return;
    }

    script.addEventListener('load', () => {
      dispatchLoadStatus('loaded');
    }, { once: true });

    script.addEventListener('error', () => {
      loadRequested = false;
      dispatchLoadStatus('blocked');
    }, { once: true });

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
