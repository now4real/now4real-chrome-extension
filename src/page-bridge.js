(() => {
  const CDN_SCRIPT_ID = 'now4real-cdn-script';
  const SETTINGS_EVENT = 'now4real-extension-settings';
  const LOAD_STATUS_EVENT = 'now4real-extension-load-status';
  const NOW4REAL_SCRIPT_URL = 'https://cdn.now4real.com/now4real.js';
  const NOW4REAL_SCRIPT_ENDPOINTS = [
    { protocol: 'https:', hostname: 'cdn.now4real.com', port: '', pathname: '/now4real.js' },
    { protocol: 'https:', hostname: 'cdn.staging.now4real.com', port: '', pathname: '/now4real.js' },
    { protocol: 'http:', hostname: 'localhost.cdn.localtest.me', port: '3000', pathname: '/now4real.js' }
  ];

  let loadRequested = false;

  function normalizeSettings(settings) {
    return {
      widgetPosition: settings && settings.widgetPosition === 'right' ? 'right' : 'left',
      demoMode: Boolean(settings && settings.demoMode),
      widgetColors: normalizeWidgetColors(settings && settings.widgetColors),
      source: typeof (settings && settings.source) === 'string'
        ? settings.source
        : 'now4real-chrome-extension/unknown'
    };
  }

  function normalizeWidgetColors(colors) {
    const background = colors && colors.background;
    const text = colors && colors.text;

    return {
      ...( /^#[0-9a-f]{6}$/i.test(background) ? {
        color_external_background: background.toLowerCase(),
        color_internal_background: background.toLowerCase()
      } : {}),
      ...( /^#[0-9a-f]{6}$/i.test(text) ? {
        color_external_text: text.toLowerCase(),
        color_internal_text: text.toLowerCase()
      } : {})
    };
  }

  function buildConfig(settings) {
    const config = {
      target: settings.demoMode ? 'demo' : 'widget',
      source: settings.source,
      widget: {}
    };

    if (settings.demoMode) {
      Object.assign(config.widget, {
        ...settings.widgetColors,
        align: settings.widgetPosition,
        align_mobile: settings.widgetPosition
      });
    }

    return config;
  }

  function applyConfig(settings) {
    window.now4real = window.now4real || {};
    window.now4real.config = buildConfig(settings);
  }

  function hasNow4realScript() {
    return Array.from(document.querySelectorAll('script[src]')).some((script) => {
      try {
        const url = new URL(script.getAttribute('src') || script.src, document.baseURI);
        return NOW4REAL_SCRIPT_ENDPOINTS.some((endpoint) => (
          url.protocol === endpoint.protocol
          && url.hostname === endpoint.hostname
          && url.port === endpoint.port
          && url.pathname === endpoint.pathname
        ));
      } catch (error) {
        return false;
      }
    });
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
    if (hasNow4realScript()) {
      dispatchLoadStatus('site-existing');
      return;
    }

    applyConfig(currentSettings);
    loadNow4real();
  }

  window.addEventListener(SETTINGS_EVENT, (event) => {
    update(event.detail);
  });
})();
