# Now4real Everywhere

Chrome Manifest V3 extension that injects the Now4real widget into pages visited by the user.

## Features

- Automatic injection of the configured Now4real CDN script on supported pages.
- Extension popup menu for turning Now4real on or off and choosing the widget position: left or right.
- Chrome Options page with the same controls.
- Demo mode that starts the widget in a shared sandbox with other test users, using `now4real.config.target = 'demo'`.
- Settings saved with `chrome.storage.sync`; changing a setting refreshes the current tab so the widget starts with the new configuration.
- Extension icons generated from the Now4real website favicon.

## Local Installation

1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Select "Load unpacked".
4. Choose this folder.

## Web Store Package Preparation

```sh
npm run validate
npm run zip
```

The `zip` command generates `now4real-chrome-extension.zip`, ready as a base package for Chrome Web Store upload.

## Technical Notes

The content script reads settings from `chrome.storage.sync`. When Now4real is enabled, it injects `src/page-bridge.js` into the page context. The bridge prepares `window.now4real.config` and loads the Now4real CDN script. Settings changes refresh the current tab instead of calling Now4real API reload methods.

Some special browser pages, such as `chrome://`, the Chrome Web Store, and pages with especially restrictive policies, do not allow extension script injection.
