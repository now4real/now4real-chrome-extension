# Now4real Everywhere

Chrome Manifest V3 extension that injects the Now4real widget into pages visited by the user.

## Features

- Automatic injection of the configured Now4real CDN script on supported pages.
- Extension popup menu for turning Now4real on or off and choosing the widget position: left or right.
- Chrome Options page with the same controls.
- Demo mode that chats only with bots and simulates counts, rankings, and maps, using `now4real.config.target = 'demo'`.
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

The content script reads settings from `chrome.storage.sync`. When Now4real is enabled, it does not inject `src/page-bridge.js` immediately. It first asks the extension background service worker for a CSP verdict for the current tab.

Current injection flow:

1. The background service worker observes the `main_frame` response through `chrome.webRequest.onHeadersReceived` and inspects the `Content-Security-Policy` header.
2. The background stores an in-memory verdict for the current tab: the Now4real CDN is either allowed, blocked, or not known yet.
3. The content script starts at `document_idle`, reads the current settings, and asks the background for that verdict before injecting anything into the page.
4. The content script also checks any `meta http-equiv="Content-Security-Policy"` declarations already present in the DOM.
5. Only if the page does not appear to block the Now4real CDN does the content script inject `src/page-bridge.js` into the page context.
6. The bridge prepares `window.now4real.config` and loads the Now4real CDN script.

This is a best-effort CSP pre-check. In most cases the background has already inspected the response headers before the content script asks for the verdict, because `onHeadersReceived` happens early in navigation and `document_idle` runs later. However, this is not a strict synchronization guarantee. The background and the content script are separate extension contexts, so there can still be edge cases where the verdict is not available yet when the content script starts.

For that reason, the extension still keeps a fallback path:

1. If the pre-check says the CDN should be blocked, the extension skips injection and stores a local warning for that host.
2. If the pre-check misses a case and the browser still blocks the CDN script, `src/page-bridge.js` emits a blocked status event.
3. The content script stores the blocked status in `chrome.storage.local`, and the popup/options UI shows a warning for the current host.

This design reduces CSP console errors by avoiding injection when a block is predictable, but it cannot guarantee that every possible CSP violation will be prevented in advance.

Some special browser pages, such as `chrome://`, the Chrome Web Store, and pages with especially restrictive policies, do not allow extension script injection.
