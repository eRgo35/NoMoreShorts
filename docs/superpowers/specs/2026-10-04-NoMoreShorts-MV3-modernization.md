# NoMoreShorts MV3 Modernization — Design

Date: 2026-10-04
Status: Approved (brainstorm gate passed)
Owner: mike

## Purpose

Modernize the NoMoreShorts extension to Manifest V3 for both Firefox and Chromium (Chrome/Edge) browsers. The extension's behavior — rewriting YouTube `/shorts/<id>` URLs into `/watch?v=<id>` — stays the same; the implementation moves from a persistent background script using blocking `webRequest` and `webNavigation` to a declarative, MV3-compliant architecture based on `declarativeNetRequest`.

The previous release shipped only on Firefox using Manifest V2, which Firefox is deprecating. A second goal is to lift the extension's build/test/release hygiene to a level matching the rest of the user's projects: multi-size icon set, ESLint flat config, vitest-based unit tests, and a GitHub Actions pipeline that lints, tests, and produces a release artifact.

## Non-goals

- No toolbar action, popup, badge counter, or settings UI. The extension remains purely a network-side URL rewriter.
- No Chrome Web Store submission. Chromium builds are distributed via GitHub releases only.
- No per-host or per-channel toggle (allow Shorts on specific channels). Deferred.
- No query/hash preservation on the rewritten URL. YouTube Shorts URLs effectively never carry meaningful query or hash parameters, so dropping them has no observable behavior change versus the current release. If a future user-visible regression appears here, a follow-up spec can address it.

## Target browsers and minimum versions

- Firefox: 115.0a1 or later. This is the first Firefox version with stable `declarativeNetRequest` support.
- Chromium (Chrome, Edge, Brave, Opera): any version supporting MV3 + `declarativeNetRequest` with host-scoped rules (Chrome 120+, Edge 120+). Minimum supported is not pinned in `manifest.json` because MV3 + `declarativeNetRequest` is the floor for any modern Chromium.

## Architecture

The MV3 version has three runtime pieces:

1. **Static DNR rule (`rules.json`)** — declared in the manifest's `declarative_net_request` block. A single `redirect`-type rule matches requests where the URL path begins with `/shorts/` on any `youtube.com` host and rewrites the path into a `/watch?v=<id>` query string.
2. **Service worker / event page (`background.js`)** — registers a small set of dynamic DNR rules on `runtime.onInstalled` as a fallback safety net. Idempotent. The static rule is the primary mechanism; the dynamic rules are belt-and-braces in case a future manifest change requires dynamic-only registration.
3. **Manifest (`manifest.json`)** — `manifest_version: 3`, declares background service worker, DNR rule resources, host permissions, and `browser_specific_settings.gecko` for Firefox-specific AMO metadata.

The existing `webNavigation.onHistoryStateUpdated` listener is removed. DNR redirect rules fire at the network layer, before any SPA router processes the navigation, so YouTube's `history.pushState`-based navigation that *would* trigger a request to `/shorts/...` is already covered by the static rule. If YouTube ever switches to client-side-only navigation that issues no `/shorts/` fetch at all, this assumption needs revisiting — noted as a risk.

## Manifest (`manifest.json`)

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

### Permission rationale

- `declarativeNetRequest` — required to register DNR rules.
- `declarativeNetRequestWithHostAccess` — required on Chrome MV3 to register host-scoped redirect rules. Firefox accepts it as a no-op.
- `host_permissions: *://*.youtube.com/*` — explicit, even though the rule itself scopes to YouTube. Belt-and-braces, and required by Chrome MV3 host-aware DNR rules.

The MV2-era permissions `webRequest`, `webRequestBlocking`, `webNavigation`, and the URL host permission in `permissions` (not `host_permissions`) are removed.

## DNR rule (`rules.json`)

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
      "resourceTypes": [
        "main_frame",
        "sub_frame"
      ]
    }
  }
]
```

### Rule mechanics

- `regexFilter` matches the full URL with an anchored RE2 pattern. Capturing group `([^/?#]+)` captures the short video id, stopping at the first `/`, `?`, or `#` so query/hash is *not* preserved on the rewrite (explicit, accepted tradeoff).
- `redirect.regexSubstitution` rewrites the matched URL using the captured group. Group 1 becomes the `v=` value.
- `resourceTypes` is restricted to `main_frame` and `sub_frame` so the rule does not match XHR/fetch/media subresource requests to `/shorts/...` thumbnails or prefetch probes.
- `priority: 1` is the minimum priority. Higher-priority rules can be added later if needed.

### Why not `urlFilter` + `redirect.url`?

`redirect.url` substitution supports a small fixed set of URL template tokens (`{}`, `{}&` etc.) but cannot extract a path segment and place it into the query string. That capability requires `regexSubstitution`. Verified during design exploration.

### RE2 limitations to remember

The current code uses a JS lookbehind in `/(?<=shorts\/).../` . RE2 (DNR's regex engine) does not support lookbehind. The pattern above uses a plain capturing group instead. This is a behavior-equivalent change.

## Background script (`background.js`)

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

async function registerFallbackRules() {
  // eslint-disable-next-line no-undef
  const dnr = chrome.declarativeNetRequest ?? browser.declarativeNetRequest;
  const existing = await dnr.getDynamicRules();
  if (existing.some((r) => r.id === FALLBACK_RULE_ID)) return;
  await dnr.updateDynamicRules({
    addRules: [fallbackRule],
    removeRuleIds: [],
  });
}

const onInstalled = () => {
  registerFallbackRules().catch((err) => console.error("NoMoreShorts:", err));
};

// eslint-disable-next-line no-undef
(chrome?.runtime?.onInstalled ?? browser.runtime.onInstalled).addListener(onInstalled);
```

### Why both static and dynamic

The static rule in `rules.json` is the primary mechanism. The dynamic rule in `background.js` is a safety net — if a future browser version or AMO validation rejects the static rule, the dynamic rule still works. The dynamic rule is idempotent: on every `onInstalled` event it checks whether the rule id already exists and skips adding a duplicate. Service worker lifecycle in MV3 may call `onInstalled` more than once across version bumps; the idempotent check prevents rule accumulation.

### No persistent state

No `chrome.storage` usage. The extension has no user settings, no per-host toggle, no statistics. Nothing to persist.

## File structure

```
manifest.json
rules.json
background.js
icons/
  icon-16.png
  icon-32.png
  icon-48.png
  icon-96.png
  icon-128.png
scripts/
  build.mjs         # zips dist/ into a release artifact
test/
  manifest.test.mjs # JSON schema sanity checks on manifest + rules
  rules.test.mjs    # asserts the DNR rule structure is well-formed
eslint.config.js    # ESLint 9 flat config
package.json        # scripts: lint, test, build
.github/
  workflows/
    ci.yml          # lint + test on push/PR
    release.yml     # build zip + attach to GitHub release on tag
README.md           # updated install + dev instructions
```

## Icon set

Current repo has a single `logo48.png` (2670 bytes). The new repo ships a 16/32/48/96/128 set rendered from the same design. Implementation: generate the five sizes from a source SVG at script time, committed into the repo. No redesign of the icon's visual is in scope.

## Build (`scripts/build.mjs`)

A small Node ESM script:

1. Reads `manifest.json`, validates it parses.
2. Reads `rules.json`, validates it parses.
3. Creates a `dist/` directory containing `manifest.json`, `rules.json`, `background.js`, and `icons/`.
4. Produces `dist/no-more-shorts-<version>.zip` from `dist/contents/`.

The script intentionally does *not* use `web-ext` to avoid pulling a heavy build dependency for a small project. Plain Node + `node:fs` + `node:child_process` invoking the platform zip command. If `zip` is not available (Windows without Git Bash), the script falls back to a Node-only zip via the `archiver` npm package — added as a dev dependency.

## Testing (`test/rules.test.mjs`, `test/manifest.test.mjs`)

Vitest with `chai` removed in favor of vitest's built-in `expect`. Tests are pure unit tests that run on Node; no browser required.

- `rules.test.mjs` — loads `rules.json`, asserts:
  - Exactly one rule.
  - `action.type === "redirect"`.
  - `action.redirect.regexSubstitution` is present and references `\1`.
  - `condition.regexFilter` compiles as RE2 (sanity check via a RE2 npm package, e.g. `re2`).
  - The regex's first capture group, when applied to the canonical short URL `https://www.youtube.com/shorts/dQw4w9WgXcQ`, captures exactly `dQw4w9WgXcQ`.
  - Applying the regex to `https://www.youtube.com/watch?v=existing` does not match.
  - Applying the regex to `https://www.youtube.com/shorts/abc/def` does not match (the rule is intentionally anchored).
- `manifest.test.mjs` — asserts:
  - `manifest_version === 3`.
  - Required MV3 keys present.
  - `permissions` does not include `webRequest`, `webRequestBlocking`, or `webNavigation`.
  - `host_permissions` includes `*://*.youtube.com/*`.
  - `declarative_net_request.rule_resources[0].path === "rules.json"`.

These tests are not exhaustive end-to-end coverage; they are structural guards so that obvious regressions break the build.

## CI (`/.github/workflows/ci.yml`)

Triggered on push and pull request to any branch.

Jobs:
1. `lint` — `npm ci && npm run lint`.
2. `test` — `npm ci && npm test`.

## Release (`/.github/workflows/release.yml`)

Triggered on tag push matching `v*`.

Jobs:
1. `build` — `npm ci && npm run build`. Uploads `dist/no-more-shorts-*.zip` as a GitHub Actions artifact.
2. `release` — uses `softprops/action-gh-release@v2` to attach the artifact to the GitHub release for the pushed tag.

No publish-to-AMO step: Firefox AMO submission is a manual step the user runs from the AMO dashboard. Not in CI scope.

## Lint (`eslint.config.js`)

ESLint 9 flat config (eslint.config.js):

- Extends `js/recommended`.
- Sets `globals.browser: true`, `globals.chrome: true`, `globals.webextensions: true`.
- Targets `**/*.js`, `**/*.mjs` under `background.js`, `scripts/`, `test/`.
- Ignores `node_modules/`, `dist/`, `icons/`.
- The previous `.eslintrc.json` is removed.

## README

Updated sections:

- Installation for Firefox AMO link (unchanged from current; add the v2.0 entry once published).
- Installation for Chromium: download `no-more-shorts-<version>.zip` from the latest GitHub release, then either (a) drag the unzipped folder into `chrome://extensions` with developer mode enabled, or (b) use a `Load unpacked` workflow. Documented step by step.
- Development: clone, `npm install`, `npm run lint`, `npm test`, `npm run build`. Load `dist/contents/` as an unpacked extension in either Firefox (`about:debugging`) or Chromium (`chrome://extensions`).

## Versioning and migration

- Manifest `version` bumps from `"1.0"` to `"2.0"`. This is a breaking manifest-level change.
- The `browser_specific_settings.gecko.id` stays the same (`nomoreshorts@czyz.icu`), so existing Firefox installs receive the v2.0 update through AMO as an automatic upgrade.
- No settings to migrate (extension has none). Existing MV2 users will get the MV3 build; on Firefox 115+ this loads fine, on Firefox <115 the user sees an incompatibility notice and is told to upgrade.
- Chromium: no prior installs (extension was Firefox-only). No migration needed.

## Risks

1. **RE2 syntax divergence.** The current code uses a JS regex with lookbehind. The DNR pattern must be RE2-compatible. Mitigated by writing the new pattern carefully and adding a unit test that exercises a known good URL.
2. **Static-rule rejection by a browser vendor.** Firefox AMO and Chrome Web Store reviews sometimes reject static rules they consider overly broad. Mitigated by the dynamic fallback rule in `background.js` and by scoping the static rule to `main_frame` + `sub_frame` only.
3. **Service worker lifecycle.** MV3 service workers are not persistent and may restart on each wakeup. `runtime.onInstalled` only fires on install or update, not on every wakeup, so the dynamic rule will not be re-registered indefinitely. Verified that `getDynamicRules` is idempotent on the rule id, so even if it did fire repeatedly, duplicates are avoided.
4. **YouTube changes the Shorts URL shape.** Out of scope to detect dynamically; if YouTube changes the URL pattern (e.g., `/shorts/embed/<id>`), the rule will need a follow-up. Mitigated by having a unit test that pins the current regex against known good URLs.
5. **Self-hosted Chromium distribution friction.** Users without developer mode enabled cannot easily install a `.zip`/unpacked extension. Documented in the README; not in scope to add a setup helper.
6. **The dynamic-rule fallback duplicates the static rule id-space.** Static rules and dynamic rules share the same id namespace in DNR. The fallback rule uses `id: 100` so it cannot collide with the static rule's `id: 1`. Verified.

## Acceptance criteria

1. Loading the extension in Firefox 115+ and navigating to `https://www.youtube.com/shorts/dQw4w9WgXcQ` results in the address bar showing `https://www.youtube.com/watch?v=dQw4w9WgXcQ` and the video loading as a normal YouTube video.
2. The same in Chrome 120+ / Edge 120+ via unpacked install.
3. Navigating to `https://www.youtube.com/watch?v=dQw4w9WgXcQ` does not trigger a redirect loop or change.
4. `npm run lint` exits 0.
5. `npm test` exits 0 with at least the manifest and rules tests passing.
6. `npm run build` produces a `.zip` whose internal structure matches `dist/contents/` exactly.
7. The GitHub Actions `ci` workflow is green on the default branch.
8. Pushing a `v2.0.0` tag produces a GitHub release with the zip attached.

## Open questions for future specs

- Should the extension ever add an in-page indicator that a redirect happened? Deferred.
- Should there be a per-host whitelist (allow Shorts on music.youtube.com)? Deferred.
- Should the extension move to AMO-signed release artifacts once it grows? Deferred until needed.