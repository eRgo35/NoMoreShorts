# NoMoreShorts MV3 Modernization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize NoMoreShorts to Manifest V3 for Firefox (≥115) and Chromium with `declarativeNetRequest` URL rewriting, multi-size icons, lint/test/CI infrastructure, and a release artifact pipeline.

**Architecture:** A single static DNR `redirect` rule in `rules.json` rewrites `/shorts/<id>` → `/watch?v=<id>` at the network layer. A tiny MV3 service worker (`background.js`) registers an idempotent dynamic fallback rule on `runtime.onInstalled`. Manifest is MV3 with `declarative_net_request`, `host_permissions`, and `browser_specific_settings.gecko`. Build/test/lint/release are driven by Node ESM scripts and vitest, run on GitHub Actions.

**Tech Stack:** Node 20+, ESM, MV3 webextension APIs, `declarativeNetRequest`, ESLint 9 (flat config), Vitest, `re2` (test dep), `archiver` (build fallback), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-NoMoreShorts-MV3-modernization.md`

## Global Constraints

- Manifest `version` starts at `"2.0"`.
- `browser_specific_settings.gecko.strict_min_version` = `"115.0a1"`; gecko id stays `nomoreshorts@czyz.icu`.
- DNR rule uses RE2 syntax only — no lookbehind, no backreferences. Use capturing groups.
- `host_permissions: ["*://*.youtube.com/*"]`; permissions = `["declarativeNetRequest", "declarativeNetRequestWithHostAccess"]`. No `webRequest*`, no `webNavigation`.
- Static rule `id: 1`, dynamic fallback rule `id: 100`. Do not let these collide.
- Icons shipped as 16/32/48/96/128 PNG.
- Lint with ESLint 9 flat config; test with Vitest; build with Node ESM script; release via GitHub Actions on tag `v*`.
- Query/hash is intentionally dropped on the rewritten URL.

## File Structure

Files created:

- `manifest.json` — MV3 manifest. The contract with browsers.
- `rules.json` — static DNR rule set, one redirect rule.
- `background.js` — service worker registering dynamic fallback rule on `runtime.onInstalled`.
- `eslint.config.js` — ESLint 9 flat config.
- `package.json` — npm scripts and dev dependencies (`vitest`, `eslint`, `re2`, `archiver`, optional `@npmcli/json-schema-validator` for manifest test).
- `.github/workflows/ci.yml` — lint + test on push/PR.
- `.github/workflows/release.yml` — build + attach zip on tag push.
- `scripts/build.mjs` — produces `dist/no-more-shorts-<version>.zip`.
- `scripts/icons.mjs` — generates the five icon sizes from a source SVG committed as `icons/source.svg`.
- `icons/source.svg` — single source of truth for the icon design.
- `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-96.png`, `icons/icon-128.png` — generated, committed.
- `test/rules.test.mjs` — DNR rule unit tests.
- `test/manifest.test.mjs` — manifest sanity tests.
- `test/background.test.mjs` — service worker registration behavior.
- `README.md` — replace existing, updated install + dev instructions.

Files removed:

- `background.js` (MV2) — replaced by new MV3 `background.js`.
- `manifest.json` (MV2) — replaced by new MV3 `manifest.json`.
- `icons/logo48.png` — replaced by `icons/icon-48.png` plus other sizes.
- `.eslintrc.json` — replaced by `eslint.config.js`.

Files modified:

- `package.json` — replaces the existing minimal script block with full lint/test/build scripts and devDeps.
- `README.md` — rewritten per spec.
- `.gitignore` — add `dist/`, `node_modules/` is already ignored.

---

## Task 1: Reset repo to clean state for MV3 work

**Files:**
- Delete: `manifest.json`, `background.js`, `.eslintrc.json`, `icons/logo48.png`
- Modify: `package.json` (replace with new shape), `.gitignore` (add `dist/`), `README.md` (will be rewritten in Task 9)

**Interfaces:**
- Consumes: nothing (prepares ground)
- Produces: empty slate with no MV2-era files, plus a placeholder `manifest.json` so subsequent tasks have something to extend

- [ ] **Step 1.1: Delete MV2-era files**

```bash
git rm manifest.json background.js .eslintrc.json icons/logo48.png
```

- [ ] **Step 1.2: Replace `package.json`**

Overwrite `package.json` with:

```json
{
  "name": "nomoreshorts",
  "version": "2.0.0",
  "description": "Force YouTube to open shorts as normal videos",
  "type": "module",
  "private": true,
  "license": "ISC",
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run",
    "build:icons": "node scripts/icons.mjs",
    "build": "node scripts/build.mjs",
    "verify": "npm run lint && npm test && npm run build"
  },
  "devDependencies": {
    "archiver": "^7.0.1",
    "eslint": "^9.13.0",
    "globals": "^15.11.0",
    "re2": "^1.21.4",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 1.3: Update `.gitignore`**

Append `dist/` so build artifacts aren't tracked. The existing `node_modules/*` line stays. File: `.gitignore`

- [ ] **Step 1.4: Add a placeholder README**

Replace `README.md` with `# NoMoreShorts\n\nMV3 modernization in progress.` (will be replaced in Task 9)

- [ ] **Step 1.5: Commit**

```bash
git add package.json .gitignore README.md
git commit -m "chore: reset repo to clean state for MV3 migration"
```

---

## Task 2: Install dev dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 1's `package.json`
- Produces: a working `node_modules` with vitest, eslint, re2, archiver, globals

- [ ] **Step 2.1: Install dependencies**

Run: `npm install`
Expected: succeeds; `node_modules/` created; `package-lock.json` written.

- [ ] **Step 2.2: Verify executables**

Run:
```bash
npx eslint --version
npx vitest --version
```
Expected: ESLint 9.x and Vitest 2.x print versions.

- [ ] **Step 2.3: Commit lockfile**

```bash
git add package-lock.json
git commit -m "chore: add dev dependencies (vitest, eslint, re2, archiver, globals)"
```

---

## Task 3: ESLint flat config

**Files:**
- Create: `eslint.config.js`

**Interfaces:**
- Consumes: ESLint 9 already installed (Task 2)
- Produces: a flat config that lints `**/*.{js,mjs}` under project root, excluding `dist/` and `node_modules/`

- [ ] **Step 3.1: Write `eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["background.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
```

- [ ] **Step 3.2: Add `@eslint/js` to devDependencies**

Run: `npm install --save-dev @eslint/js`
Expected: `package.json` devDependencies now includes `@eslint/js`.

- [ ] **Step 3.3: Smoke-run lint**

Run: `npm run lint`
Expected: exits 0 with no output (no source files yet, only the config itself to lint). If `eslint.config.js` triggers warnings, fix them in place.

- [ ] **Step 3.4: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: add ESLint 9 flat config"
```

---

## Task 4: DNR static rule (`rules.json`)

**Files:**
- Create: `rules.json`

**Interfaces:**
- Consumes: the regex pattern from spec, RE2-compatible
- Produces: a JSON file consumed by the manifest's `declarative_net_request.rule_resources`

- [ ] **Step 4.1: Write `rules.json`**

```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "redirect",
      "redirect": {
        "regexSubstitution": "https://www.youtube.com/watch?v=\\1"
      }
    },
    "condition": {
      "regexFilter": "^https?://(?:www\\.)?youtube\\.com/shorts/([^/?#]+)/?$",
      "resourceTypes": ["main_frame", "sub_frame"]
    }
  }
]
```

- [ ] **Step 4.2: Validate JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('rules.json','utf8'))"`
Expected: no output, exit 0.

- [ ] **Step 4.3: Commit**

```bash
git add rules.json
git commit -m "feat(rules): add static DNR redirect rule for /shorts/<id>"
```

---

## Task 5: Service worker (`background.js`)

**Files:**
- Create: `background.js`

**Interfaces:**
- Consumes: `chrome.declarativeNetRequest` and/or `browser.declarativeNetRequest` at runtime
- Produces: idempotent registration of a dynamic fallback rule on `runtime.onInstalled`

- [ ] **Step 5.1: Write `background.js`**

```js
const FALLBACK_RULE_ID = 100;

const fallbackRule = {
  id: FALLBACK_RULE_ID,
  priority: 2,
  action: {
    type: "redirect",
    redirect: {
      regexSubstitution: "https://www.youtube.com/watch?v=\\1",
    },
  },
  condition: {
    regexFilter: "^https?://(?:www\\.)?youtube\\.com/shorts/([^/?#]+)/?$",
    resourceTypes: ["main_frame", "sub_frame"],
  },
};

function getDNR() {
  if (typeof chrome !== "undefined" && chrome.declarativeNetRequest) {
    return chrome.declarativeNetRequest;
  }
  if (typeof browser !== "undefined" && browser.declarativeNetRequest) {
    return browser.declarativeNetRequest;
  }
  throw new Error("NoMoreShorts: declarativeNetRequest API unavailable");
}

async function registerFallbackRules() {
  const dnr = getDNR();
  const existing = await dnr.getDynamicRules();
  if (existing.some((r) => r.id === FALLBACK_RULE_ID)) return;
  await dnr.updateDynamicRules({
    addRules: [fallbackRule],
    removeRuleIds: [],
  });
}

function onInstalled() {
  registerFallbackRules().catch((err) => {
    console.error("NoMoreShorts: fallback rule registration failed", err);
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(onInstalled);
} else if (typeof browser !== "undefined" && browser.runtime?.onInstalled) {
  browser.runtime.onInstalled.addListener(onInstalled);
}
```

- [ ] **Step 5.2: Smoke-check syntax**

Run: `node --check background.js`
Expected: exit 0, no output.

- [ ] **Step 5.3: Commit**

```bash
git add background.js
git commit -m "feat(bg): register idempotent DNR fallback rule on install"
```

---

## Task 6: Manifest (`manifest.json`)

**Files:**
- Create: `manifest.json`

**Interfaces:**
- Consumes: `rules.json` (path referenced), `background.js` (path referenced), icon filenames
- Produces: MV3 manifest accepted by Firefox 115+ and Chromium MV3

- [ ] **Step 6.1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "NoMoreShorts",
  "version": "2.0",
  "description": "Force YouTube to open shorts as normal videos",

  "browser_specific_settings": {
    "gecko": {
      "id": "nomoreshorts@czyz.icu",
      "strict_min_version": "115.0a1"
    }
  },

  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png"
  },

  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess"
  ],

  "host_permissions": [
    "*://*.youtube.com/*"
  ],

  "background": {
    "service_worker": "background.js"
  },

  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "shorts-redirect",
        "enabled": true,
        "path": "rules.json"
      }
    ]
  }
}
```

- [ ] **Step 6.2: Validate JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`
Expected: exit 0, no output.

- [ ] **Step 6.3: Commit**

```bash
git add manifest.json
git commit -m "feat(manifest): upgrade to MV3 with DNR redirect"
```

---

## Task 7: Generate multi-size icons

**Files:**
- Create: `icons/source.svg`, `scripts/icons.mjs`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-96.png`, `icons/icon-128.png`

**Interfaces:**
- Consumes: a source SVG committed as `icons/source.svg`
- Produces: five PNG sizes

- [ ] **Step 7.1: Write `icons/source.svg`**

A 64x64 SVG of a simple YouTube-style play button over a red rounded rectangle. Concrete content:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" ry="12" fill="#FF0033"/>
  <polygon points="24,18 24,46 48,32" fill="#FFFFFF"/>
  <line x1="6" y1="54" x2="58" y2="10" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
</svg>
```

(The diagonal line is a "no" slash over the play symbol, matching the "no shorts" intent.)

- [ ] **Step 7.2: Write `scripts/icons.mjs`**

```js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sizes = [16, 32, 48, 96, 128];
const root = resolve(import.meta.dirname, "..");
const svgPath = resolve(root, "icons/source.svg");

if (!existsSync(svgPath)) {
  console.error(`Missing ${svgPath}`);
  process.exit(1);
}

try {
  execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
} catch {
  console.error("rsvg-convert not found. Install librsvg2-bin (apt) or librsvg (brew).");
  process.exit(1);
}

for (const size of sizes) {
  const out = resolve(root, `icons/icon-${size}.png`);
  execFileSync("rsvg-convert", [
    "-w", String(size),
    "-h", String(size),
    "-f", "png",
    "-o", out,
    svgPath,
  ]);
  console.log(`wrote ${out}`);
}

// Sanity: each PNG must be non-empty
for (const size of sizes) {
  const buf = readFileSync(resolve(root, `icons/icon-${size}.png`));
  if (buf.length < 100) {
    console.error(`icons/icon-${size}.png suspiciously small (${buf.length} bytes)`);
    process.exit(1);
  }
}
```

- [ ] **Step 7.3: Install rsvg-convert**

Run (Debian/Ubuntu): `sudo apt-get install -y librsvg2-bin`
Run (Fedora — this workstation): `sudo dnf install -y librsvg2-tools`
Run (macOS): `brew install librsvg`
Expected: `rsvg-convert --version` prints a version.

- [ ] **Step 7.4: Generate icons**

Run: `npm run build:icons`
Expected: five PNGs created in `icons/`, each non-empty.

- [ ] **Step 7.5: Verify PNGs**

Run: `ls -la icons/icon-*.png`
Expected: five files, sizes scaling with dimensions.

- [ ] **Step 7.6: Commit**

```bash
git add icons/source.svg scripts/icons.mjs icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-96.png icons/icon-128.png
git commit -m "feat(icons): multi-size icon set generated from SVG source"
```

---

## Task 8: Tests (rules, manifest, background)

**Files:**
- Create: `test/rules.test.mjs`, `test/manifest.test.mjs`, `test/background.test.mjs`

**Interfaces:**
- Consumes: `rules.json`, `manifest.json`, `background.js`
- Produces: vitest test files

### Task 8a: Rules tests

- [ ] **Step 8a.1: Write `test/rules.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RE2 from "re2";

const rulesPath = resolve(import.meta.dirname, "..", "rules.json");
const rules = JSON.parse(readFileSync(rulesPath, "utf8"));

describe("rules.json", () => {
  it("has exactly one rule", () => {
    expect(rules).toHaveLength(1);
  });

  it("uses redirect action with regex substitution referencing \\1", () => {
    const rule = rules[0];
    expect(rule.action.type).toBe("redirect");
    expect(rule.action.redirect.regexSubstitution).toContain("\\1");
    expect(rule.action.redirect.regexSubstitution).toBe(
      "https://www.youtube.com/watch?v=\\1",
    );
  });

  it("scopes resourceTypes to main_frame and sub_frame", () => {
    expect(new Set(rules[0].condition.resourceTypes)).toEqual(
      new Set(["main_frame", "sub_frame"]),
    );
  });

  it("regex captures the short id and rewrites to /watch?v=<id>", () => {
    const pattern = rules[0].condition.regexFilter;
    const re = new RE2(pattern);
    const url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    const m = re.exec(url);
    expect(m).not.toBeNull();
    const substituted = rules[0].action.redirect.regexSubstitution.replace(
      "\\1",
      m[1],
    );
    expect(substituted).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("does not match non-shorts YouTube URLs", () => {
    const re = new RE2(rules[0].condition.regexFilter);
    expect(re.exec("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(re.exec("https://www.youtube.com/")).toBeNull();
  });

  it("does not match shorts URLs with extra path segments", () => {
    const re = new RE2(rules[0].condition.regexFilter);
    expect(re.exec("https://www.youtube.com/shorts/abc/extra")).toBeNull();
  });

  it("does not use RE2-incompatible syntax (lookbehind)", () => {
    expect(rules[0].condition.regexFilter).not.toMatch(/\(\?<=|\(\?<!|\(\\k</);
  });
});
```

- [ ] **Step 8a.2: Run rules tests**

Run: `npx vitest run test/rules.test.mjs`
Expected: 7 passing.

### Task 8b: Manifest tests

- [ ] **Step 8b.1: Write `test/manifest.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(import.meta.dirname, "..", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("manifest.json", () => {
  it("declares manifest_version 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("uses service_worker background", () => {
    expect(manifest.background.service_worker).toBe("background.js");
  });

  it("requests DNR permissions and host permissions", () => {
    expect(manifest.permissions).toContain("declarativeNetRequest");
    expect(manifest.permissions).toContain("declarativeNetRequestWithHostAccess");
    expect(manifest.host_permissions).toContain("*://*.youtube.com/*");
  });

  it("does not request MV2-era permissions", () => {
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("webRequestBlocking");
    expect(manifest.permissions).not.toContain("webNavigation");
    expect(manifest.host_permissions ?? []).not.toContain(
      "*://*.youtube.com/*".replace("&", "*"),
    );
  });

  it("declares DNR rule resources", () => {
    expect(manifest.declarative_net_request).toBeTruthy();
    const resources = manifest.declarative_net_request.rule_resources;
    expect(resources).toHaveLength(1);
    expect(resources[0].path).toBe("rules.json");
    expect(resources[0].enabled).toBe(true);
  });

  it("declares Firefox gecko id and min version", () => {
    expect(manifest.browser_specific_settings.gecko.id).toBe(
      "nomoreshorts@czyz.icu",
    );
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe(
      "115.0a1",
    );
  });

  it("declares five icon sizes", () => {
    const sizes = Object.keys(manifest.icons);
    expect(new Set(sizes)).toEqual(new Set(["16", "32", "48", "96", "128"]));
  });
});
```

- [ ] **Step 8b.2: Run manifest tests**

Run: `npx vitest run test/manifest.test.mjs`
Expected: 7 passing.

### Task 8c: Background script tests

- [ ] **Step 8c.1: Write `test/background.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bgPath = resolve(import.meta.dirname, "..", "background.js");
const bgSource = readFileSync(bgPath, "utf8");

describe("background.js", () => {
  it("registers a dynamic fallback rule with id 100", () => {
    expect(bgSource).toMatch(/FALLBACK_RULE_ID\s*=\s*100/);
  });

  it("uses regexSubstitution referring to capture group 1", () => {
    expect(bgSource).toMatch(/regexSubstitution[^"]*"https:\\/\\/www\\.youtube\\.com\\/watch\\?v=\\\\1"/);
  });

  it("skips re-registration if rule id already present", () => {
    expect(bgSource).toMatch(/existing\.some\(\(r\) => r\.id === FALLBACK_RULE_ID\)/);
  });

  it("registers listener on runtime.onInstalled via chrome or browser global", () => {
    expect(bgSource).toMatch(/chrome\.runtime\.onInstalled|browser\.runtime\.onInstalled/);
  });

  it("falls back to console.error on registration failure", () => {
    expect(bgSource).toMatch(/console\.error/);
  });
});
```

- [ ] **Step 8c.2: Run background tests**

Run: `npx vitest run test/background.test.mjs`
Expected: 5 passing.

### Task 8d: Commit

- [ ] **Step 8d.1: Run all tests**

Run: `npm test`
Expected: all suites passing.

- [ ] **Step 8d.2: Commit**

```bash
git add test/rules.test.mjs test/manifest.test.mjs test/background.test.mjs
git commit -m "test: cover rules, manifest, and background script"
```

---

## Task 9: Build script (`scripts/build.mjs`)

**Files:**
- Create: `scripts/build.mjs`

**Interfaces:**
- Consumes: `manifest.json`, `rules.json`, `background.js`, `icons/`
- Produces: `dist/no-more-shorts-<version>.zip`

- [ ] **Step 9.1: Write `scripts/build.mjs`**

```js
import { createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createGzip } from "node:zlib";
import archiver from "archiver";

const root = resolve(import.meta.dirname, "..");
const distRoot = resolve(root, "dist");
const stageDir = resolve(distRoot, "contents");
const manifest = JSON.parse(
  await (await import("node:fs/promises")).readFile(resolve(root, "manifest.json"), "utf8"),
);
const version = manifest.version;
const zipName = `no-more-shorts-${version}.zip`;
const zipPath = resolve(distRoot, zipName);

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

const entries = ["manifest.json", "rules.json", "background.js"];
for (const entry of entries) {
  await (await import("node:fs/promises")).copyFile(
    resolve(root, entry),
    resolve(stageDir, entry),
  );
}

const iconsSrc = resolve(root, "icons");
const iconsDst = resolve(stageDir, "icons");
mkdirSync(iconsDst, { recursive: true });
for (const name of readdirSync(iconsSrc)) {
  if (name === "source.svg") continue;
  if (!name.endsWith(".png")) continue;
  await (await import("node:fs/promises")).copyFile(
    resolve(iconsSrc, name),
    resolve(iconsDst, name),
  );
}

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: createGzip() });
  output.on("close", resolvePromise);
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") console.warn(err);
    else reject(err);
  });
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(stageDir, false);
  archive.finalize();
});

const size = statSync(zipPath).size;
console.log(`Built ${zipPath} (${size} bytes)`);
```

- [ ] **Step 9.2: Smoke build**

Run: `npm run build`
Expected: `dist/no-more-shorts-2.0.zip` created, output line "Built …" printed.

- [ ] **Step 9.3: Verify zip contents**

Run:
```bash
unzip -l dist/no-more-shorts-2.0.zip
```
Expected: lists `manifest.json`, `rules.json`, `background.js`, `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-96.png`, `icons/icon-128.png` — no `icons/source.svg`.

- [ ] **Step 9.4: Commit**

```bash
git add scripts/build.mjs
git commit -m "feat(build): zip dist contents into release artifact"
```

---

## Task 10: README rewrite

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: installed extension's behavior
- Produces: install + dev docs for Firefox and Chromium

- [ ] **Step 10.1: Write `README.md`**

```markdown
# NoMoreShorts

Force YouTube to open Shorts as normal videos. Removes the vertical Shorts player by transparently rewriting `https://www.youtube.com/shorts/<id>` into `https://www.youtube.com/watch?v=<id>`.

## Install

### Firefox (115 or later)

Install from the [Firefox Add-ons page](https://addons.mozilla.org/) (search for NoMoreShorts).

### Chromium (Chrome, Edge, Brave, Opera)

Download `no-more-shorts-<version>.zip` from the [latest GitHub release](https://github.com/eRgo35/NoMoreShorts/releases/latest).

1. Extract the zip.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** in the top-right.
4. Click **Load unpacked** and select the extracted folder.

## How it works

Manifest V3 with `declarativeNetRequest`. A single static redirect rule in `rules.json` rewrites any `/shorts/<id>` request to `/watch?v=<id>` at the network layer, before YouTube's SPA router handles it. A small service worker (`background.js`) registers an idempotent fallback rule on install.

Query string and hash are dropped on the rewritten URL — YouTube Shorts URLs effectively never carry meaningful parameters.

## Development

Requirements: Node 20+, `rsvg-convert` (from librsvg) for icon generation.

```bash
npm install
npm run lint
npm test
npm run build:icons   # regenerates icons/icon-*.png from icons/source.svg
npm run build         # produces dist/no-more-shorts-<version>.zip
```

To load the build into Firefox for local development: `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `dist/contents/manifest.json`.

To load into Chromium: `chrome://extensions` with developer mode enabled, **Load unpacked**, pick `dist/contents/`.

## License

ISC.
```

- [ ] **Step 10.2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for MV3 + Chromium install"
```

---

## Task 11: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: push and pull_request events
- Produces: lint + test runs on every push and PR

- [ ] **Step 11.1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install librsvg
        run: sudo apt-get update && sudo apt-get install -y librsvg2-bin
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build:icons
      - run: npm run build
      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: no-more-shorts-zip
          path: dist/*.zip
```

- [ ] **Step 11.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint + test + build on every push and PR"
```

---

## Task 12: GitHub Actions release

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: tag push events matching `v*`
- Produces: GitHub release with zip attached

- [ ] **Step 12.1: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Install librsvg
        run: sudo apt-get update && sudo apt-get install -y librsvg2-bin
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build:icons
      - run: npm run build
      - name: Attach zip to release
        uses: softprops/action-gh-release@v2
        with:
          files: dist/*.zip
          generate_release_notes: true
```

- [ ] **Step 12.2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and attach release zip on tag push"
```

---

## Task 13: Local end-to-end smoke verification

**Files:**
- No new files. Smoke test against `dist/contents/` loaded as a temporary extension.

**Interfaces:**
- Consumes: built dist + a Firefox 115+ or Chromium instance
- Produces: human-verified confirmation that the rule actually rewrites a real `/shorts/` URL

- [ ] **Step 13.1: Build dist**

Run: `npm run verify`
Expected: lint, test, build all exit 0.

- [ ] **Step 13.2: Load into Firefox 115+**

Open Firefox 115+. `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `dist/contents/manifest.json`.

- [ ] **Step 13.3: Verify the redirect in the browser**

Visit `https://www.youtube.com/shorts/dQw4w9WgXcQ`.
Expected: address bar updates to `https://www.youtube.com/watch?v=dQw4w9WgXcQ` and the video loads in the normal player.

- [ ] **Step 13.4: Verify non-shorts URLs are untouched**

Visit `https://www.youtube.com/`.
Expected: stays at `/`, no redirect loop.

- [ ] **Step 13.5: Verify in Chromium (optional but recommended)**

Open Chrome 120+ or Edge 120+. `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `dist/contents/`. Repeat Steps 13.3 and 13.4.

- [ ] **Step 13.6: Capture results**

Note in a comment on the eventual tag/release: which browser was used, the URL tested, and the observed final URL. If the redirect did not fire, do NOT tag — fix the rule and rebuild.

---

## Task 14: Tag v2.0.0 and trigger release

**Files:**
- No new files. Git tag + push.

**Interfaces:**
- Consumes: green local smoke (Task 13)
- Produces: a GitHub release with `no-more-shorts-2.0.zip` attached

- [ ] **Step 14.1: Tag**

Run:
```bash
git tag -s v2.0.0 -m "v2.0.0 — MV3 + Chromium"
git push origin v2.0.0
```
Expected: tag pushed, `release.yml` workflow runs, attaches the zip to the GitHub release for `v2.0.0`.

- [ ] **Step 14.2: Verify release artifact**

Open the GitHub release page. Confirm `no-more-shorts-2.0.zip` is attached and downloads cleanly. Extract and confirm `manifest.json` declares `manifest_version: 3`.

---

## Self-Review

**Spec coverage:**
- MV3 manifest with DNR ✓ — Tasks 4, 5, 6.
- Permissions rationale ✓ — Task 6 step 6.1 + Task 8b step 8b.1.
- Static + dynamic rule ✓ — Tasks 4, 5.
- `host_permissions` ✓ — Task 6.
- Multi-size icons ✓ — Task 7.
- ESLint flat config ✓ — Task 3.
- Vitest tests for rules/manifest/background ✓ — Task 8.
- Build script + zip artifact ✓ — Task 9.
- GitHub Actions CI ✓ — Task 11.
- GitHub Actions release ✓ — Task 12.
- README ✓ — Task 10.
- Local smoke verification ✓ — Task 13.
- Tag + release ✓ — Task 14.
- Browser target Firefox ≥115 ✓ — Task 6.
- Chromium support ✓ — Tasks 6, 11, 13.
- Self-hosted distribution only ✓ — Tasks 12, 14.

**Placeholder scan:** searched for TBD / TODO / "implement later" / "fill in" — none. All code blocks are concrete.

**Type/name consistency:**
- `FALLBACK_RULE_ID` referenced in Task 5 and asserted in Task 8c. Same value `100` everywhere.
- `\\1` in regexSubstitution referenced in Tasks 4 and 5, asserted in Task 8a and 8c.
- Icon filenames `icon-{16,32,48,96,128}.png` referenced in Tasks 6, 7, 9, 11, 12.
- `no-more-shorts-<version>.zip` referenced in Tasks 9, 11, 12, 14.
- Manifest `version: "2.0"` in Task 6; zip name derived from it; npm `version: "2.0.0"` in Task 1 (the npm package version and the manifest version are tracked separately and intentionally).