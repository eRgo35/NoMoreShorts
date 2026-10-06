# NoMoreShorts

Force YouTube to open Shorts as normal videos. Removes the vertical Shorts player by transparently rewriting `https://www.youtube.com/shorts/<id>` into `https://www.youtube.com/watch?v=<id>`.

## Install

### Firefox (115 or later)

Install from the Firefox Add-ons page (search for NoMoreShorts).

### Chromium (Chrome, Edge, Brave, Opera)

Download `NoMoreShorts-v<version>.zip` from the [latest GitHub release](https://github.com/eRgo35/NoMoreShorts/releases/latest).

1. Extract the zip.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** in the top-right.
4. Click **Load unpacked** and select the extracted `chrome/` folder.

## How it works

Manifest V3 with `declarativeNetRequest`. A single static redirect rule in `rules.json` rewrites any `/shorts/<id>` request to `/watch?v=<id>` at the network layer, before YouTube's SPA router handles it. A small service worker (`background.js`) registers an idempotent fallback rule on install.

Query string and hash are dropped on the rewritten URL — YouTube Shorts URLs effectively never carry meaningful parameters.

## Development

Requirements: Node 22+, `rsvg-convert` (from librsvg) for icon generation.

```bash
npm install
npm run lint
npm test
npm run build:icons   # regenerates icons/icon-*.png from icons/source.svg
npm run build         # produces dist/chrome/, dist/firefox/, NoMoreShorts-v<version>.xpi, NoMoreShorts-v<version>.zip
```

To load the build into Firefox for local development: `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `dist/firefox/manifest.json`.

To load into Chromium: `chrome://extensions` with developer mode enabled, **Load unpacked**, pick `dist/chrome/`.

## License

ISC.
