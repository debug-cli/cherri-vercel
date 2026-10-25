# Agent Notes

Notes for anyone (human or agent) changing this repository. Read this before the
first edit: most of what looks like dead code here is vendored upstream code, and
most of the "weird" patterns are deliberate workarounds for a static host.

## What this is

Graip is a fork of [Cherri](https://github.com/x8rr/cherri) — a static
"unblocked games / web proxy" site. There is **no build step and no package
manifest**. Every file under version control is served as-is, so:

- edit the HTML/CSS/JS that ships; never introduce a bundler, transpiler, or
  `node_modules` dependency into the site itself;
- the only tooling allowed is what exists in `tests/` (dependency-free
  `node:test`) plus an optional throwaway jsdom harness for verification;
- `stores/` (2.5 GB), `libcurl/` (6 MB), `uv/`, `baremux/`, `fa/`,
  `homework/` and much of `assets/` are third-party drops. Do not reformat,
  minify, or "clean up" them, and keep diffs to them mechanical.

Deployment target is a static host (Vercel, or any file server). That means:
no server-side routes, no trailing-slash rewrites, no `Location` handling, and
**no `/wisp/` endpoint on this origin** — the "This site" preset only works if a
deployment happens to put one there.

## Layout

| Path | What lives there |
| --- | --- |
| `index.html` | The whole app shell: sidebar, settings panels, tabs, `navTo()`, game/app list loaders. ~1.8k lines of markup *plus* most of the site's inline JS. |
| `pages/*.html` | Everything `navTo()` loads into `#contentFrame`: `browser`, `browser-minimum`, `embed`, `play`, `movies`, `watch`, `movieframe`, `apps`, `games`, `partners`, `assistant`, `vms`, `chatrooms`, `gmbl`. No `settings.html` — settings live in `index.html`. |
| `newtab.html`, `404.html`, `start.html` | `newtab` is the new-tab page; `404` is the host's not-found page; `start.html` is the Classroom disguise and is excluded from link/nav tests. |
| `assets/js/` | First-party scripts (see below). `assets/js/lib/` is third-party. |
| `panic.html` | The panic decoy: black screen until the target has loaded, then a decoy page. Self-contained (no CSS/CDN/proxy) so it works on a filtered network. |
| `manifest.json` | PWA manifest (standalone, `/?launch=1` start URL, SVG icon). |
| `vercel.json` | Cache/header rules only; there is no build. |
| `assets/json/` | Game/app lists (`classplay.json`, `gn-math.json`, `apps.json`, `config/particles.json`). |
| `assets/css/`, `styles/` | Theme variables (`colors.css` + `assets/css/themes/*.css`) and layout. |
| `sw.js` | Scramjet's service worker: `importScripts("/assets/js/proxy-errors.js", "/homework/chemistry.sw.js")`, plus an ad blocklist and the proxy error page. |
| `uv/`, `baremux/` | Ultraviolet bundle + bare-mux worker. The older backend. |
| `homework/` | Disguised names for the proxy runtime: `math.all.js` is Scramjet, `science.sync.js` is its inject script, `chemistry.sw.js` is the SW half, `english.bundle.js` is libcurl's page-side helpers. Treat the names as load-bearing. |
| `libcurl/` | Generated libcurl.js bundles (see "Proxy stack"). |
| `tests/` | `node --test` suites. This is the only supported test command. |

## First-party JavaScript

| File | Responsibility |
| --- | --- |
| `assets/js/wisp.js` | Wisp endpoint list, URL normalisation, handshake probe, pooled failover, `configureTransport()`, `describeError()`. Everything is exposed as `window.GraipWisp`. |
| `assets/js/dropdown.js` | Custom dropdown widgets: Wisp selector, search engine, game store, backend, particles. Reads `GraipWisp`; must load **after** `wisp.js`. |
| `assets/js/browserfunctions.js` | Tab model, `go()`/`nav()`, frame creation, Scramjet controller bootstrap, transport wiring, route recovery. Loaded by every browsing page *after* `math.all.js`, `wisp.js`, `english.bundle.js`. |
| `assets/js/proxy-errors.js` | Shared classifier for curl/libcurl failures (`GraipProxyErrors`). Used by both the page and the service worker. |
| `assets/js/settings.js` | Legacy settings helpers. Also included by ~96 pages inside `stores/`, which have no settings UI at all — every lookup in it must stay optional. |
| `assets/js/colors.js` | Applies the saved theme to `#css-theme-link` on first paint. |
| `assets/js/vm.js` | Legacy Hyperbeam VM launcher; the markup it needs exists on no current page, so it must no-op. |
| `assets/js/log.js` | `window.GraipLog`: the exportable debug log. Installs global capture (errors, rejections, `console.error/warn`, `fetch`, SW reports) and owns `graip_debugLog`, `graip_verboseLogs`. **Loads first on every page.** |
| `assets/js/cloak.js` | `window.GraipCloak`: disguise profiles, panic key, `about:blank` window, decoy documents. Owns the `decoy`, `graip_cloak*`, `graip_panic*` keys. Loads on every page and re-applies the disguise on load. |
| `assets/js/debug-panel.js` | Settings wiring for the Debug + Panic controls. Mounts toggles into `.graip-toggle-slot` placeholders by cloning an existing `.switch`, so new switches cannot drift visually. |
| `assets/js/t.js` / `splash.js` / `cursor.js` | Toasts, homepage splash text, custom cursor. |

Conventions:

- Plain browser JS: no modules except `import("/libcurl/libcurl.mjs")`, no
  TypeScript, no framework. `index.html` uses Alpine 3 (CDN) on some pages and
  hand-written DOM code elsewhere.
- 2-space indent in `assets/js`, 4-space indent in HTML, tabs in `sw.js` and the
  vendored files. Match the surrounding file — this repo has three styles and
  that is fine.
- Personal/global state uses `localStorage` with the `graip_` prefix. Never
  reuse a `cherri_` key (the old prefix is dead and intentionally not migrated
  except where noted in code).
- **Every DOM/global lookup in shared scripts must tolerate absence.** A page
  that does not use a feature still loads the shared file, and one uncaught
  `TypeError` at top level kills the rest of that file for that page. Guard
  (`if (!el) return;`), do not assume.
- User-visible strings are lowercase, short, and sentence-cased without a
  trailing period on buttons ("Test current server", not "Test Server.").
- Comments explain *why* a workaround exists, not what the next line does. The
  existing comments are the reason this codebase is maintainable; add one when
  you encode a non-obvious constraint.

## Proxy stack

Two backends, chosen in Settings → Proxy:

1. **Scramjet** (default). The page owns the controller
   (`new $scramjetController.Controller({ serviceworker, transport, config })`)
   and the SW only forwards `prefix` requests back to it. Frames are per tab
   (`scramjetFrames`). Prefix `/~/sj/`; runtime files are under `/homework/`.
2. **Ultraviolet** (legacy). `uv/sw.js` handles `/uv/service/`, and bare-mux
   carries the transport. bare-mux is created lazily (`getBareMuxConnection()`)
   so a blocked `/baremux/index.js` cannot take down the Scramjet path.

Transport: libcurl.js compiled to WASM, talking to a **Wisp** server over a
WebSocket. `libcurl/` holds generated bundles:

- `index.mjs` / `index.js` / `index.cjs` — UMD/ESM builds used by bare-mux and
  by `import()`; each embeds the WASM as base64.
- `libcurl.mjs` — the ES entry that `browserfunctions.js` imports.
- All four were generated from `@mercuryworkshop/libcurl-transport@2.0.6` +
  `libcurl.js@0.7.5`. **Never hand-edit the embedded base64 WASM, the CA bundle,
  or the TLS verification flags.** To update: download both packages, rebuild the
  bundle, re-run `tests/libcurl-bundle.test.js` (it checks the WASM magic,
  `wasm not loaded` messaging, the 15 s load timeout, and the `libcurl_abort`
  path).

### Wisp selection contract

Storage keys (`GraipWisp.KEYS`):

- `graip_wispUrlSelected` — the endpoint the user picked (preset id, `Custom`,
  or `Local`). **Never** overwritten by failover.
- `graip_wispUrl` — the endpoint last used (may be a fallback).
- `graip_wispUrlFallback` — set only when traffic moved automatically; cleared
  when the preferred endpoint works again or the user picks.
- `graip_wispUrlCustom`, `graip_wispUrlVerifiedAt` — custom URL and freshness.

Rules that must not regress:

- A probe is only successful when the server sends the initial Wisp packet
  (v1 sends `CONTINUE` for stream 0 immediately; a socket that opens and stays
  silent is not a Wisp server). A URL that does not end in `/` is not Wisp.
- The preferred endpoint is probed alone first (1.5 s); only then is the
  community pool raced. Availability is not guaranteed for any public endpoint,
  so never describe them as "official" or "reliable" in UI copy.
- `setActiveServer()` (manual pick) clears the fallback and invalidates the
  per-tab cache. `resetCache()` forces a fresh probe (Settings → "Test current
  server").
- `describeError()`/`GraipProxyErrors` classify curl codes: 7 = route down,
  35 = TLS handshake, 60 = peer verification. Error 60 means the destination's
  chain, the client's trust bundle, the clock, or route interception — **not**
  that a different Wisp host will help; route retries exist to diagnose, and TLS
  verification must stay on.

## Debug log

`GraipLog` is the single recorder. Nothing calls `console.log` for diagnostics anymore; a feature logs
through `GraipLog.debug/info/warn/error(category, message, data)` and, for user actions,
`GraipLog.action(...)`.

- Two streams: **verbose on** (default) records everything; **verbose off** still records
  `warn`/`error`. `setVerbose()` persists to `graip_verboseLogs` and re-posts the config to the
  service worker.
- Bounded: 1000 entries in memory, the last 400 mirrored into `graip_debugLog` (debounced write) so a
  crash still leaves evidence. `clear()` keeps exactly one entry: "log cleared".
- Privacy: `safeUrl()` strips the query string and fragment from every URL before it is stored, and
  values are truncated. **Never log a full URL, a token, or page content.**
- `sw.js` reports through `postMessage({ $graip$log: … })`, batched (25 entries / 400 ms), and only
  after the page sends `$graip$logConfig`. Navigations are always reported; static subresources only
  on failure.
- Export: `exportJSON()`, `exportText()`, `download("json"|"txt")`, `copy()` — wired to Settings →
  Debug.

Adding a log line to a new feature is expected, not optional: "capture every action" is the point of
the panel.

## Panic and cloaking

- `panic.html` is the only page that must render **nothing** of graip. It loads log.js and cloak.js
  (for `safeUrl` and `blankDocument`) but sets `data-graip-no-auto-cloak="1"` on `<html>` so
  cloak.js does not overwrite its decoy title.
- The blackout is a `#blackout` overlay that is only removed once the target frame fires `load`
  (+ two RAFs for same-origin targets, + a timeout as the last resort). Never reveal the frame
  earlier: the whole feature exists so that the proxy is never visible while the decoy loads.
- `GraipCloak.PROFILES` is the single list of disguises (title + icon + decoy page kind).
  `dropdown.js` renders it, `panic.html` uses it, `about:blank` uses it. Add a profile there only.
- Panic defaults: **off**, key `\`, destination Google Classroom, same-tab, decoy page on. A panic
  writes `sessionStorage.graip_panicReturn` so `browserfunctions.js` can wipe the tab session on the
  way back, and `clearBrowserTraces()` scrubs the address bar.
- Letter keys (`z`, `q`) must not fire while typing or with modifiers; `matches()` enforces this.

## Tabs and the omnibox

- Tab state lives in `bTabs`; the session is mirrored to `sessionStorage["graip_tabs:<pathname>"]`
  (`saveTabSession()` on every mutation + `pagehide`). Restored tabs are **lazy**: the URL is kept in
  `tab.restoreUrl` and only navigated when the tab is first shown.
- `pages/browser.html` and `pages/browser-minimum.html` call `restoreTabSession()` (falls back to one
  new tab); an explicit `?launch=` always starts fresh.
- Omnibox: `installOmnibox()` (shortcuts) + `installOmniboxInput()` (bangs) run on DOMContentLoaded in
  `browserfunctions.js`. `resolveOmniboxInput()` is pure and unit-tested — extend the bang table there.
- `clearBrowserTraces()` / "Clear session traces" forgets the tab session and the URL. Do not store
  visited URLs anywhere else.

## Small-screen and offline

- `assets/css/mobile.css` and the mobile section at the end of `styles/index.css` are **media-query
  only**. `tests/mobile-pwa.test.js` fails if a top-level rule appears there, so the desktop layout
  cannot regress by accident.
- `sw.js` caches only same-origin GETs outside `/~/sj/` and `/uv/service/` (`SHELL_ASSETS`,
  `graip-shell-v1`). Navigations are network-first with a cache fallback. Never cache proxied or
  cross-origin responses; bump `SHELL_CACHE` when the asset list changes.

## UI conventions

- Settings panels are `#settings-{general,gaming,cloaking,debug,proxy,info,updates}`.
  Sidebar entries carry `data-target` that must equal the panel suffix; deep
  links use `/?launch=1&settings=1&section=proxy`. `switchSettingsPage()` ignores
  unknown targets instead of blanking the area — keep that behaviour.
- Loaded pages are iframes inside `#contentFrame`; a page-local "Settings" link
  must therefore be `/?launch=1&amp;settings=1` with `target="_top"`.
- Reloading a proxied tab goes through `go(tab.url, tabId)` after
  `ensureTransport(true)`. Never assign `iframe.src` directly: the SW error page
  and the controller cache both depend on the `go()` path.
- Toasts: `showToast(type, message, iconClass)` from `t.js`/inline.
- New toggles: put `<div class="graip-toggle-slot" data-slot="name"></div>` in the panel and mount a
  clone in `debug-panel.js`. Do not copy the 40-line SVG switch markup by hand.
- New dropdowns: `<select class="settings-select">` is styled and already used by the panic controls;
  the custom `.x-selector` components are only worth it for ones with icons.

## Testing and verification

```bash
node --test tests/*.test.js      # the only supported command; must stay green (76 tests)
```

No network access is needed (or allowed) for the suites. They run in a `vm`
context with mocked DOM/`localStorage`/`WebSocket`, so:

- arrays created inside the context have a different `Array.prototype`; compare
  with `JSON.stringify`, not `assert.deepStrictEqual`;
- workers (`sw.js`) need `importScripts` and `self.addEventListener` mocks;
- when a suite parses HTML, assert on strings (for example "does this page
  include `id="css-theme-link"`") rather than booting a DOM.

For behavioural checks, an out-of-tree jsdom harness works well:

```bash
python3 -m http.server 8899 --bind 0.0.0.0 &     # from the repo root
cd /tmp/verify && npm i jsdom@24                  # throwaway, never committed
```

Harness notes:

- `process.on("unhandledRejection", () => {})` is mandatory: jsdom surfaces page
  errors as unhandled rejections and will otherwise kill the process.
- Use `resources: "usable"` + `pretendToBeVisual: true`, wait for `load`, then
  ~300 ms before clicking (dropdowns populate asynchronously).
- Expect noise and filter it: `MessagePort`, `ServiceWorker`/`register`,
  `lucide`/`marked`/`io`/Tailwind CDN failures, WebGL, `canvas.getContext()`
  returning null, and `particles.js` drawing. None of that is a site bug.
- Chromium/Playwright is not available here, so proxy traffic cannot be
  exercised end to end. Do not claim a proxy fix is "verified" — say what was
  and was not covered.

## Known traps

- Third-party endpoints `api.x8r.dev` (VMs, CometChat tokens) and the chat
  socket server are long dead. Features built on them must degrade with a
  visible message, not hang on a loader.
- The movies grid talks to TMDb with a public key. The host is
  `api.themoviedb.org`; `api.tmdb.org` does not serve the API.
- CDN dependencies (Alpine, Tailwind, `marked`, `lucide`, `socket.io`,
  `emoji-mart`, fonts) fail on filtered networks. Any feature that needs them
  must check for the global before using it.
- `stores/ucp-games/*`, `homework/math.all.js` and `assets/icons/fonts/index.html`
  are huge vendored files: greps and diffs against them are noise, and
  `start.html` is a byte-for-byte Classroom copy whose links are decoration.
- The repo has a single commit of history; diff against
  `https://github.com/x8rr/cherri` (shallow clone) to see what this fork changed.
- `tests/site-wiring.test.js` enforces the invariants that were already broken
  once: the Movies tab opens the built-in page, side menus deep-link to
  `/?launch=1&settings=1`, and every `navTo()`/`switchSettingsPage()` target
  exists.
- `tests/panic-log.test.js` (log filtering/redaction, panic key matching, panic
  navigation, panic page structure, cloak profiles, tab restore, omnibox) and
  `tests/mobile-pwa.test.js` (media-query-only CSS, manifest, service worker
  shell caching, library hygiene) cover the features added on top of the fork.
  Both load the real modules into a `vm` context with a fake DOM/storage; prefer
  extending them over adding a new harness.
- Anything that changes the top-level URL, title or storage must also update
  `AGENTS.md`: the cloaking story is easy to break silently.
