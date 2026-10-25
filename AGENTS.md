# Agent Notes

Everything about this repository that is not obvious from reading one file.

It has three audiences, in this order:

1. **Someone who does not write code** and wants to know what graip is, why it is worth using as
   their everyday proxy, and what to click when something breaks — [Part 1](#part-1--for-people-who-do-not-write-code).
2. **Someone who does write code** and needs a map of every file before touching one —
   [Part 2](#part-2--for-people-who-do-write-code).
3. **An AI/agent** doing either of the above: the rules in
   [Known traps](#known-traps) and [Sweep findings](#repo-sweep) are hard-won. Read them last, obey
   them always.

Scale of the repository, so nothing here is a surprise: **8,401 tracked files, ~2.7 GB**, of which
roughly **120 are first-party**. `stores/` alone is 7,026 files / 2.5 GB of vendored games, `fa/` is
409 files of icon fonts, `assets/img/` is 811 images. Everything else — the actual site — is small
enough to read end to end in an afternoon.

---

# Part 1 — For people who do not write code

## What graip is, in one paragraph

graip is a website. You open it, and it gives you three things in one place: a **proxy browser**
(type a blocked site's address, read or use it inside graip), a big **games library** (575 games at
the time of writing, playable in the tab, no downloads), and a **movie/TV browser** (search films and
episodes, press play, they stream in a frame). Around that there are apps shortcuts, a small AI chat,
wallpaper-style themes, and a set of privacy features built for a school laptop: a **panic key** that
swaps the whole tab for a fake Classroom page, a **fake tab title and icon**, and an installable
"app" mode that keeps working even when the network starts filtering things.

It is one folder of files with no server of its own (a "static site"). You can use somebody else's
copy, or put your own copy online for free in about five minutes — see the buttons in `README.md`.

## Why make it your main

Not because it is the only proxy site — there are hundreds. Because it is the one that behaves like a
product instead of a demo:

- **One address does everything.** Most sites give you a proxy *or* a games page *or* a movie site,
  then send you to a different domain for each. Here the browser, the games, the apps and the movies
  are tabs in the same app, so you bookmark one thing and stay in it. Your open browser tabs survive
  a reload — the same way a real browser's do — so an accidental F5 does not throw away the page you
  were on.
- **It answers the questions teachers ask.** The tab title and icon can claim to be Google Docs or
  Classroom; one key (backslash by default) turns the tab into a page that looks like schoolwork for
  the half-second a teacher is looking, then either replaces the tab or moves you to a neutral site.
  While that decoy loads you see a plain **black screen**, not a flash of the proxy — the detail other
  "panic buttons" get wrong. Nothing about your tabs is left in the address bar or in storage
  afterwards.
- **It works when the network gets worse.** Every other proxy site is a blank page the moment the
  filter starts blocking it. graip registers a service worker, so the shell (menus, settings, the
  proxy's own UI) is cached on your device: on a filtered or offline network the UI still boots and
  tells you which Wisp route is down instead of showing a browser error page. You can also install it
  as an app (browser menu → Install / Add to Home Screen), which is what most people actually want on
  a Chromebook.
- **It does not lie to you when something is broken.** Every action, every proxy request, every
  failed thumbnail and every error is recorded in a **debug log** you can export as a file from
  Settings → Debug. When a site will not load, the log says whether the route was down, TLS was
  intercepted, or the destination itself refused — and you can hand that file to whoever maintains
  your copy instead of describing a blank screen. Several of the built-in features are honest about
  being dead (the chat, VM and AI pages depend on third-party services that no longer answer) and now
  say so on screen rather than spinning forever.
- **Your settings are yours.** No account, no sign-in, no analytics of what you browse (the debug log
  strips query strings before it stores anything). Preferences live in your own browser and can be
  saved to a file and restored on another machine — useful on school machines that wipe profiles, and
  useful for setting up a friend.
- **It is maintained like software.** There are 106 automated tests, a documented layout, a changelog
  of what the fork fixed, and a licence that keeps it open (AGPL-3.0). That is why a bug you report
  can actually be fixed, which is not true of a site whose repository is a screenshot and a Discord
  invite.
- **You are not stuck with someone else's copy.** Deploy it yourself (Vercel, Netlify, Cloudflare
  Pages, GitHub Pages, Render, Railway, Replit, Glitch — `README.md` has buttons), or run it locally
  with one command. A copy you host is a copy nobody can quietly take down.

## What it is *not* — read this before complaining

This document would be useless if it sold you something the code cannot do:

- **A proxy needs a route out.** graip proxies through a public **Wisp** server. If your school
  blocks WebSockets altogether, nothing client-side can fix it — the browser page will tell you so.
  You can also host your own route (see `README.md` → self-hosting a Wisp server); that is the only
  real answer on a hostile network.
- **Public Wisp endpoints are donated, not guaranteed.** They are community servers. They go down,
  rate-limit, or disappear. graip tests them, falls back automatically, and shows you which one
  answered, but it cannot make somebody else's server reliable.
- **It is not invisible.** A determined administrator who logs DNS or sees a websocket to an unknown
  host can tell something is happening. The cloaking features protect against a glance and against a
  browser-history check, not against a packet-level audit.
- **Some sites will still fail.** Certificate errors (error 60) come from the destination's chain,
  your clock, or a filter intercepting TLS. graip refuses to disable certificate checking to "fix"
  that, because doing so would put your logins at risk.
- **The chat, VM and AI pages depend on third parties.** Chat needs an external socket server (dead
  at the time of writing, and it says so), VMs embed browser.lol, and the AI talks to
  pollinations.ai. Games, apps, movies and the browser are the parts that do not depend on anyone.
- **Movies are streams from third-party embed sites.** They are not hosted here, quality varies, and
  the metadata comes from TMDb, which needs a live connection.
- **The site counts its own page views.** `index.html` loads an Umami analytics tag, and tries a
  first-party visitor counter whose endpoint is dead. That is site traffic, not a record of what you
  browse — but if you host your own copy and want neither, delete that tag and the dead counter
  block.

## First five minutes

1. Open the site **with `?launch=1`** on the end of the address (`https://your-site/?launch=1`).
   Without it you land on `start.html`, which is a deliberately dull Google Classroom lookalike — the
   disguise, not the app. The `/` of a deployed copy redirects there on purpose.
2. Press the **gear** in the sidebar → **Proxy**. Press *Test current server*. If it fails, pick
   another route in the list and test again; the test only proves the route answered, not that every
   site will load through it.
3. Go to **Cloaking**. Choose a *Tab Cloak* (the title + icon your tab will claim), turn on **Auto
   about:blank** if you want the site to live in a `about:blank` tab, and set up the **Panic key**:
   pick the key, the destination (Classroom by default) and whether it replaces this tab. Press *Test
   panic now* once so you know what it does before you need it.
4. Go to **Backup** and press *Save settings file*. Keep it. School machines wipe browser storage.
5. Optional: browser menu → **Install app** (Chrome/Edge/Chromebook) so graip opens like a normal
   application and keeps its offline shell.

### Keyboard, in one table

| Keys | What happens |
| --- | --- |
| `Ctrl/Cmd + L` | Focus the address bar |
| `Ctrl/Cmd + T` | New tab |
| `Ctrl/Cmd + W` | Close this tab |
| `Ctrl + Tab` | Next tab |
| `Ctrl/Cmd + Shift + T` | Reopen the last closed tab |
| `Alt + ←` / `Alt + →` | Back / forward |
| `!g cats`, `!ddg cats`, `!b`, `!yt`, `!w`, `!gh`, `!r` | Search a specific site from the address bar |
| Panic key (default `\`) | Panic: decoy page, then your destination |

Typing something with a dot in it goes to that site; anything else becomes a search with your chosen
search engine.

## When something breaks

| What you see | What to do |
| --- | --- |
| A site spins forever | Settings → Proxy → test another route. The debug log (Settings → Debug) names the failure. |
| "error code 60" | That site's certificate is being rejected. Try another route once; if it persists, it is the destination or TLS interception, not graip. |
| Games list empty | Reload. If it stays empty, Settings → Debug → *Check library now* reports the JSON/thumbnail problems. |
| Blank page after a deploy | You deployed to a subfolder, or `sw.js` is not at the root. Deploy at the domain root. |
| Redirected to a Classroom lookalike | That is `start.html`. Add `?launch=1`. |
| Everything is gone | Settings → Backup → restore your saved file. It reloads the page on purpose. |

If you are going to ask for help, Settings → **Debug → Export JSON** first. That file contains the
answers (and no query strings, so no search terms).

---

# Part 2 — For people who do write code

## The 60-second orientation

- **No build step, no package manifest.** Every tracked file is served as-is. Edit what ships. No
  bundler, no npm dependency, no TypeScript.
- **The whole app is `index.html`** (1,646 lines: markup + most of the site's inline JS) plus
  `pages/*.html` loaded into an iframe, plus `assets/js/*.js` which is plain browser JS.
- **Proxy runtime is vendored** under `homework/` (Scramjet), `uv/` (Ultraviolet),
  `baremux/` (transport plumbing), `libcurl/` (WASM curl) and `sw.js` (the service worker).
- **Tests are `node --test tests/*.test.js`** — 13 files, 106 tests, no dependencies, no network.
  That is the only supported command.
- **Deployment is a static host** (Vercel by default, `vercel.json` holds headers only). No
  server-side routes and **no `/wisp/` endpoint on this origin** unless a deployment adds one.

## Every file, explained

### Root

| File | Lines | What it is |
| --- | --- | --- |
| `index.html` | 1,646 | The app shell: sidebar nav, tab strip, address bar, apps/games/partners/download drawers, the eight settings panels, the library loaders, `navTo()`, the visitor counter, theme and panic wiring. 37 `<script>` blocks, most of the site's behaviour. |
| `panic.html` | 231 | Self-contained panic decoy. Black screen → decoy page inside a frame → reveals only after the target loads. Loads only `log.js` and `cloak.js`. No CDN, no CSS from the site, so it works on a dead network. |
| `newtab.html` | 44 | The tiny "hi! try searching" page every new browser tab opens. |
| `404.html` | 190 | Host 404 page: "not found", a link home, a `#contentFrame`, toasts and both service-worker registrations. Its `navTo()`/`rSearch()`/toast JS is inherited from the old shell and mostly unreachable (there is no `#homesearch` input and no nav), but it must keep pointing at real pages. |
| `start.html` | 50,878 | A byte-for-byte saved copy of a Google Classroom page. It is the disguise the bare domain shows; its links are decoration and every test excludes it. **Never reformat it, never "fix" its markup, do not add it to test page lists.** |
| `sw.js` | 651 | Scramjet's service worker plus this fork's additions: immediate `skipWaiting`/`claim`, proxy-error classification, the ad blocklist, the offline shell cache, and debug-log reporting to the page. |
| `manifest.json` | 49 | PWA manifest: standalone, `/?launch=1` start URL, SVG + 160×160 PNG icons, three shortcuts (browser/games/movies). |
| `vercel.json` | 29 | Headers only: manifest MIME type, `sw.js` no-cache + `Service-Worker-Allowed: /`, one-week cache on `/assets/*`, `nosniff`, `no-referrer`. No build, no rewrites. |
| `README.md` | — | The public document: features, how it differs from other proxies, deploy buttons per host, Wisp self-hosting, troubleshooting, credits to x8r, FORK NOTICE. |
| `AGENTS.md` | this file | Layout, contracts, traps. Update it when behaviour changes. |
| `MOVING.md` | 12 | Legacy stub of the old readme (fork notice + the Cloudflare asset-limit note). Not linked from the site; `README.md` supersedes it. |
| `LICENSE` | — | GNU AGPL-3.0. Forking and hosting is fine; publishing a modified version means publishing the source. Keep it. |
| `.gitignore` | 41 | Ignores build output (none exists), `node_modules`, `.env`, JetBrains/Netlify folders, and the private `KEYS.json` / `graip-*-worker` folders the upstream author used. |
| `.github/workflows/sync-fork.yml` | 21 | Nightly `gh repo sync` of the **default branch** from the upstream parent, plus manual dispatch. It is destructive to `main`: never do fork work on the default branch. |
| `docs/superpowers/plans/2026-10-03-curl-60-wisp-scramjet-diagnosis.md` | — | The investigation plan that produced the TLS error classification and the Wisp probe tests. Historical: it names libcurl 0.7.1, the repo now ships 0.7.5. Useful as design rationale, not as current state. |

### `pages/` — what `navTo()` and the drawers load into `#contentFrame`

| File | Lines | What it is |
| --- | --- | --- |
| `browser.html` | 328 | The main proxied browser: tab strip, address bar, back/forward/reload, fullscreen, Eruda console, home button. Boots the Scramjet controller. |
| `browser-minimum.html` | 353 | Same browser without the floating logo/side menu; used where the chrome would be in the way. |
| `embed.html` | 360 | Browser page meant to be embedded by other pages (VMs, games that open a proxied URL). Reads `?launch=` and navigates once. |
| `play.html` | 507 | Game player: an iframe for a `/stores/…` game plus the overlay (session timer, clock/temperature, recording buttons, download). |
| `games.html` | 343 | The Games drawer as a standalone page (search + tiles) for linking from outside the shell. |
| `apps.html` | 327 | Same for the app shortcuts list. |
| `partners.html` | 295 | Partner sites list (two entries). |
| `movies.html` | 214 | TMDb search/browse grid. |
| `watch.html` | 510 | TMDb detail page: seasons/episodes, and a player that embeds third-party stream providers (pstream.mov, multiembed.mov, vidsrc). |
| `movieframe.html` | 154 | Legacy wrapper that embeds `movies.html` full-screen with its own top nav. |
| `assistant.html` | 467 | The "AI" page: prompt box, markdown/KaTeX/highlight rendering from CDNs, text and image generation against pollinations.ai. |
| `vms.html` | 144 | VM page: embeds `/pages/embed.html?launch=https://browser.lol/create` (a VM reached through the proxy). |
| `chatrooms.html` | 3,196 | Socket.io chat UI (emoji-mart, dev-tunnel backend). Degrades to a visible "chat unavailable" notice when the client or server is missing. |
| `gmbl.html` | 220 | A joke slot-machine page (`party-js`). Its nav entry is commented out in `index.html`; it is reachable only by URL. |
| `classroom.html` | 37,761 | A second saved Classroom copy, older and unused by any page or nav item. Tests exclude it. Leave it alone or delete it deliberately, but do not wire it up. |

### `assets/js/` — first-party JavaScript (19 files including `lib/`)

| File | Lines | Responsibility |
| --- | --- | --- |
| `log.js` | 547 | `window.GraipLog`. Installs global capture (errors, rejections, `console.warn/error`, `fetch`, service-worker reports) and records actions. Owns `graip_debugLog`, `graip_verboseLogs`. **Loaded first on every page.** |
| `cloak.js` | 607 | `window.GraipCloak`. Nine disguise profiles (title + icon + decoy page), nine panic destinations, eight panic keys, the `about:blank` window, and the decoy document builder. Owns `decoy`, `graip_cloak*`, `graip_panic*`, `graip_autoAB`. |
| `browserfunctions.js` | 1,199 | The browser engine: tab model (`bTabs`), `newTab/switchTab/closeTab/nav/go`, Scramjet controller + libcurl transport bootstrap, Ultraviolet fallback, route recovery, tab-session persistence, URL scrubbing, omnibox shortcuts and bangs. |
| `wisp.js` | 779 | `window.GraipWisp`. 30 endpoints, URL normalisation, real Wisp handshake probing, pooled failover, `configureTransport()`, curl error classification. |
| `settings-io.js` | 831 | `window.GraipSettings`. Backend-free settings backup: `SCHEMA` allowlist, per-type validation, export/import/preview/reset, the Backup panel wiring. |
| `debug-panel.js` | 456 | Settings wiring for Debug + Panic panels: clones an existing `.switch` into `.graip-toggle-slot` placeholders, renders panic controls, `GraipCheckLibrary`, `GraipProbeAll`. |
| `dropdown.js` | 429 | The custom dropdown widgets (Wisp, backend, search engine, game store, theme, cloak) and their storage keys. Must load after `wisp.js` and `cloak.js`. |
| `settings.js` | 216 | Legacy settings helpers (`cloakMe`, `applyTheme`, wisp status text). **Also included by 96 vendored pages under `stores/`** that have no settings UI, so every lookup must stay optional. |
| `proxy-errors.js` | 84 | `GraipProxyErrors`: turns curl exit codes (7/35/60/…) and libcurl messages into one classifier used by both the page and `sw.js`. |
| `colors.js` | 12 | Applies the saved theme to `#css-theme-link` before first paint. Must tolerate pages without that element. |
| `t.js` | 146 | `showToast(type, message, iconClass)` and the toast stack. |
| `cursor.js` | 115 | The ZXS-style custom cursor; reads `graip_customCursor`, cleans up its listeners when disabled. |
| `splash.js` | 88 | The rotating homepage splash phrases. |
| `vm.js` | 118 | Legacy Hyperbeam VM launcher with a 20-minute cooldown. Loaded by `vms.html` and `assistant.html`, whose UI is an iframe instead — so it no-ops by design. |
| `chatrooms.js` | 129 | CometChat client (token via `api.x8r.dev`). **Not loaded by any page** — `chatrooms.html` implements its own socket.io chat. Dead code kept for reference. |
| `lib/particles.js` | 963 | Vendored particles.js (background dots). Loaded by 10 pages. |
| `lib/three.min.js` | 26,887 | Vendored three.js, required by Vanta. Loaded only by `index.html`. |
| `lib/vanta.fog.min.js` | 440 | Vendored Vanta fog effect. Loaded only by `index.html`. |
| `lib/detectmobile.js` | 35 | UA sniffing helper (`isMobile()`); used only by a few vendored GN-Math pages, not by first-party pages. |

### `assets/css/` and `styles/`

| File | Lines | What it is |
| --- | --- | --- |
| `styles/index.css` | 1,763 | The app shell: nav, tabs, address bar, drawers, settings sheet, toasts, library tiles, plus the **media-query-only** mobile block at the end. |
| `assets/css/colors.css` | 18 | Default palette (13 CSS variables on `:root`: `--bg`…`--accent-2`). Loaded everywhere as `#css-theme-link`. |
| `assets/css/themes/*.css` | 16 | One file per theme: `coral.css`, `dunes.css`, `ember.css`, `forest.css`, `golden.css`, `lavendar.css`, `lime.css`, `magenta.css`, `midnight.css`, `mint.css`, `neon.css`, `ocean.css`, `royal blue.css` (note the space), `sea.css`, `violet.css`, `void.css`. Same variable names as `colors.css`. |
| `assets/css/elements.css` | 344 | Shared layout for the standalone pages (grids, bottom nav, custom select, fonts). |
| `assets/css/dropdown.css` | 137 | The `.x-selector` widgets used by settings. |
| `assets/css/font.css` | 151 | 24 `@font-face` rules for the bundled fonts (figtree, funnel, geist, gg sans, google sans, inter, interotf, jakarta, lexend, manrope, onest, quicksand, rubik, sfc, sora, space grotesk). |
| `assets/css/t.css` | 55 | Toast container/animation. |
| `assets/css/overlay.css` | 154 | The in-game overlay (recording widget, session timer, info panel). |
| `assets/css/ai-elements.css` | 32 | Chat bubbles for the AI page. |
| `assets/css/cursor.css` | 47 | Custom cursor visuals. |
| `assets/css/mobile.css` | 142 | Small-screen rules. **Only inside `@media (max-width: 640px)`** — the test suite fails if a top-level rule appears. |

### Data, images, fonts, icons

| Path | Contents |
| --- | --- |
| `assets/json/classplay.json` | 97 game entries (`name`, `url`, `img`) for the Classplay/UCP store. |
| `assets/json/gn-math.json` | 478 game entries for the GN-Math store. |
| `assets/json/apps.json` | 30 app shortcuts (external sites + a local icon). |
| `assets/json/partners.json` | 2 partner entries. **Known inconsistency:** both point at `prism.onl`; the Hydra entry has its own `hydra.png` but reuses `prism.png`. |
| `assets/json/config/particles.json` | particles.js config for the pages that enable the dotted background. |
| `assets/img/games/` | 119 PNG thumbnails plus `gn-math/` with 622 more (one per GN-Math entry). |
| `assets/img/apps/` | 50 icons; 29 are referenced by `apps.json` (the rest are spares). |
| `assets/img/cloaks/` | 8 disguise favicons (gclassroom, gdrive, google, gmail, edpuzzle, iready, blooket, kahoot). |
| `assets/img/partners/` | `prism.png`, `hydra.png`. |
| `assets/img/fav.png`, `fav.svg`, `cover.png`, `s.png`, `c-down.png` | App icon (160×160 PNG + SVG), social cover, and two small UI sprites. `cover.png` is only referenced by the stale `og:image` meta — see sweep findings. |
| `assets/fonts/` | 16 TTFs/OTFs plus `gg-sans/` (4 weights) and `sfc/` (6 SF Compact weights). `googlesans.ttf` alone is 4 MB. |
| `assets/icons/fonts/` | Remix Icon 4.7.0: `remixicon.css` (linked as `/assets/icons/fonts/remixicon.css`), woff2/ttf/eot, glyph JSON, and the vendor's own `index.html`/`symbol.html`/`unicode.html` demo pages — ~1 MB of HTML that is not part of the site. |
| `fa/` | Font Awesome **Free 7.1.0**: 21 CSS files in `fa/css/` and 388 webfont files. Pages load `all.css`, `all.min.css`, `solid.css` and `all-pro.css`; only the free glyph set is present, so Pro-only names (e.g. `fa-hood-cloak`, `fa-cog`) render nothing. |

### Proxy runtime (vendored — read, never edit)

| Path | What it is |
| --- | --- |
| `homework/math.all.js` (227 KB + 800 KB map) | Scramjet's client bundle (`$scramjet`, main world + injected world). Disguised filename is load-bearing. |
| `homework/science.sync.js` | Scramjet's controller **page-side** half (`$scramjetController`). |
| `homework/chemistry.sw.js` | Scramjet's controller **service-worker** half, imported by `sw.js`. |
| `homework/english.bundle.js` | Scramjet controller bundle (reports `0.0.14`) loaded by the browser pages; exposes `$scramjetController.Controller`. |
| `homework/history.wasm.wasm` | The 585 KB WebAssembly payload the controller loads. |
| `homework/*.js.map` | Four source maps (`chemistry.sw.js.map`, `english.bundle.js.map`, `math.all.js.map`, `science.sync.js.map`, 0.9 MB total). Never fetched by the site; they exist so a stack trace from a proxied page can be read. Harmless to ship, and the only way to debug the bundles. |
| `uv/uv.bundle.js`, `uv/uv.client.js`, `uv/uv.handler.js`, `uv/uv.sw.js` | Ultraviolet 3.2.10 (build 92d9075), the legacy backend. |
| `uv/uv.config.js` | UV config: prefix `/uv/service/`, XOR URL codec, script paths. |
| `uv/sw.js` | The UV service-worker entry (`importScripts` the bundle, config and `uv.sw.js`). |
| `baremux/index.js`, `index.mjs`, `worker.js` | bare-mux v2.1.7 (build c56d286): the MessagePort plumbing between page, worker and transport. |
| `libcurl/index.js`, `index.mjs`, `index.cjs` | libcurl.js 0.7.5 + `@mercuryworkshop/libcurl-transport` 2.0.6, WASM embedded as base64. |
| `libcurl/libcurl.mjs` | 11-line ES re-export so bare-mux and the Scramjet controller share one copy of the bundle. |
| `sw.js` (root) | The service worker that actually ships: Scramjet + error pages + blocklist + shell cache. |

### `stores/` (7,026 files, 2.5 GB — third-party game data)

| Path | What it is |
| --- | --- |
| `stores/ucp-games/` | 6,402 files, 54 game folders (Unity/WebGL builds, HTML5 games, a 49 MB single-file `html/gd.html`, 70 MB `owt2/index.pck`). Each folder is an upstream drop; `README.md` inside says "Game stash for Classplay". |
| `stores/gn-math/` | 624 single-file HTML games (`0.html`…), referenced by `assets/json/gn-math.json`. |

Both are served as plain static files and opened either directly in `#contentFrame` or through
`pages/play.html`. Do not reformat, minify, lint or "clean up" anything in here, and keep diffs
mechanical.

### `tests/` — 13 files, 106 tests, `node --test`

| File | Tests | Covers |
| --- | --- | --- |
| `wisp.test.js` | 5 | URL normalisation, preset lookup, handshake probing. |
| `wisp-selection.test.js` | 7 | Chosen endpoint survives failover, fallback labelling, custom URLs. |
| `proxy-errors.test.js` | 3 | curl code → user-facing message classification. |
| `scramjet-errors.test.js` | 4 | `sw.js` transport error page and proxy-vs-origin failures. |
| `service-worker-control.test.js` | 2 | `skipWaiting`/`clients.claim` and controller readiness. |
| `libcurl-bundle.test.js` | 6 | WASM magic in the bundle, load timeout, abort path, no TLS downgrade. |
| `browser-recovery.test.js` | 2 | Route recovery and the "try another route" path. |
| `browser-tab-navigation.test.js` | 1 | `go()`/`nav()` wiring and the failure branch. |
| `page-bootstrap.test.js` | 11 | Every first-party page boots with missing DOM/globals (the "pages must tolerate what they do not use" rule). |
| `site-wiring.test.js` | 8 | Local asset references resolve, nav targets exist, settings sidebar matches panels, no `/pages/*.html` link points at a missing file, the visitor counter cannot throw, Movies tab, side-menu deep links. |
| `panic-log.test.js` | 19 | Log filtering/redaction, panic key matching, panic navigation, panic page structure, cloak profiles, tab restore, omnibox. |
| `mobile-pwa.test.js` | 10 | Media-query-only CSS, desktop selectors untouched, manifest validity, SW shell caching, library placeholders. |
| `settings-io.test.js` | 28 | Settings allowlist, per-type validation, partial imports, reset, no-storage/no-logger paths, panel wiring. |

## Which page loads what

`log.js` and `cloak.js` are on every page (17 + `panic.html`). Beyond that:

| Page | Extra first-party scripts | Stylesheets |
| --- | --- | --- |
| `index.html` | `t.js`, `wisp.js`, `proxy-errors.js`, `browserfunctions.js`, `dropdown.js`, `debug-panel.js`, `settings-io.js`, `colors.js`, `splash.js`, `cursor.js`, `lib/particles.js`, `lib/three.min.js`, `lib/vanta.fog.min.js` | `styles/index.css`, `colors.css`, `t.css`, `dropdown.css`, `font.css`, `fa/*`, remixicon |
| `pages/browser.html`, `browser-minimum.html`, `embed.html` | `wisp.js`, `proxy-errors.js`, `browserfunctions.js`, `t.js`, `colors.js`, `cursor.js`, `baremux/index.js`, `homework/math.all.js`, `homework/english.bundle.js`, `lib/particles.js` | `colors.css`, `elements.css`, `font.css`, `t.css`, `mobile.css`, remixicon |
| `pages/play.html` | `colors.js`, `cursor.js`, `lib/particles.js` | `colors.css`, `elements.css`, `overlay.css`, `mobile.css` |
| `pages/assistant.html` | `colors.js`, `cursor.js`, `t.js`, `vm.js`, `lib/particles.js` | `colors.css`, `elements.css`, `overlay.css`, `ai-elements.css`, `t.css`, `mobile.css` |
| `pages/vms.html` | `colors.js`, `cursor.js`, `t.js`, `vm.js`, `lib/particles.js` | `colors.css`, `elements.css`, `overlay.css`, `t.css`, `mobile.css` |
| `pages/games.html`, `apps.html`, `partners.html` | `colors.js`, `lib/particles.js` | `colors.css`, `elements.css`, `font.css`, remixicon |
| `pages/movies.html`, `watch.html`, `movieframe.html` | `colors.js`, `cursor.js` | `colors.css`, `font.css` (+ Tailwind/Alpine CDNs) |
| `pages/chatrooms.html`, `gmbl.html`, `classroom.html` | none | none (self-contained) |
| `404.html`, `newtab.html` | `colors.js`, `t.js` (newtab) | `styles/index.css`, `colors.css`, `fa/*` |

`panic.html` loads nothing but `log.js` + `cloak.js` and its own inline `<style>` — that is a
requirement, not an accident.

## Proxy stack

Two backends, chosen in Settings → Proxy:

1. **Scramjet** (default). The page owns the controller
   (`new $scramjetController.Controller({ serviceworker, transport, config })`) and the SW only
   forwards `prefix` requests back to it. Frames are per tab (`scramjetFrames`). Prefix `/~/sj/`;
   runtime files live under `/homework/`.
2. **Ultraviolet** (legacy). `uv/sw.js` handles `/uv/service/`, and bare-mux carries the transport.
   bare-mux is created lazily (`getBareMuxConnection()`) so a blocked `/baremux/index.js` cannot take
   down the Scramjet path.

Transport: libcurl.js compiled to WASM talking to a **Wisp** server over a WebSocket. `libcurl/`
holds generated bundles (`index.mjs`/`index.js`/`index.cjs`/`libcurl.mjs`), all built from
`@mercuryworkshop/libcurl-transport@2.0.6` + `libcurl.js@0.7.5`, each embedding the WASM as base64.

**Never hand-edit the embedded base64 WASM, the CA bundle, or the TLS verification flags.** To
update: download both packages, rebuild the bundle, re-run `tests/libcurl-bundle.test.js` (WASM magic,
`wasm not loaded` messaging, the 15 s load timeout, the `libcurl_abort` path).

### Wisp selection contract

Storage keys (`GraipWisp.KEYS`):

- `graip_wispUrlSelected` — the endpoint the user picked (preset id, `Custom`, or `Local`). **Never**
  overwritten by failover.
- `graip_wispUrl` — the endpoint last used (may be a fallback).
- `graip_wispUrlFallback` — set only when traffic moved automatically; cleared when the preferred
  endpoint works again or the user picks.
- `graip_wispUrlCustom`, `graip_wispUrlVerifiedAt` — custom URL and freshness.

`GraipWisp.PRESETS` lists **30** endpoints (Mercury, Anura 1–6, Phantom, rhw, Alu 1–4, Incognito 1–4,
Definitely Science 1–4, Terbium 1–4, Radius 1–2 plus two ad-blocking Radius routes). Rules that must
not regress:

- A probe is only successful when the server sends the initial Wisp packet (v1 sends `CONTINUE` for
  stream 0 immediately; a socket that opens and stays silent is not a Wisp server). A URL that does
  not end in `/` is not Wisp.
- The preferred endpoint is probed alone first (1.5 s); only then is the pool raced. Availability is
  not guaranteed for any public endpoint, so never describe them as "official" or "reliable" in UI
  copy.
- `setActiveServer()` (manual pick) clears the fallback and invalidates the per-tab cache.
  `resetCache()` forces a fresh probe (Settings → *Test current server*).
- `describeError()`/`GraipProxyErrors` classify curl codes: 7 = route down, 35 = TLS handshake,
  60 = peer verification. Error 60 means the destination's chain, the client's trust bundle, the
  clock, or route interception — **not** that a different Wisp host will help; route retries exist to
  diagnose, and TLS verification must stay on.

## Debug log

`GraipLog` is the single recorder. Nothing calls `console.log` for diagnostics; a feature logs through
`GraipLog.debug/info/warn/error(category, message, data)` and, for user actions,
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
  Debug. `GraipCheckLibrary` and `GraipProbeAll` are the panel's diagnostic buttons.

Adding a log line to a new feature is expected, not optional: "capture every action" is the point of
the panel.

## Settings export / import

`GraipSettings` (`assets/js/settings-io.js`) is the only thing that may read or write settings in
bulk.

- `SCHEMA` is the **allowlist**, one entry per preference: `{ key, group, label, type }`, plus
  `trueValue`/`falseValue` for the two toggle conventions (`yes`/`no` and `on`/`off`) and `options`
  for enums. A new setting must be added there or it will not survive a backup. Types: `bool`,
  `token`, `label`, `text`, `url`, `wisp`, `key`, `enum`.
- Nothing else is exported. `IGNORED` names the runtime keys that must never travel (`graip_wispUrl`,
  `graip_wispUrlFallback`, `graip_wispUrlVerifiedAt`, `graip_debugLog`, `graip_libraryIssues`,
  `graip_siteVersion`), and `graip_tabs*` is skipped by prefix. The log is not a setting: it has its
  own export.
- Import **re-validates every value** — a config file is untrusted input. `url` accepts only
  `http(s)://`, a single-leading-slash site path, or `about:blank`; `wisp` only `ws(s)://`; `token`
  and `label` are anchored regexes so `../` cannot reach the theme `<link href>`. Rejected entries
  are reported per key and never block the rest.
- Merge semantics: absent keys are untouched, `null`/`""` on an optional key means "leave it alone",
  unchanged values are not rewritten. Importing a Wisp choice clears `graip_wispUrl`,
  `graip_wispUrlFallback` and `graip_wispUrlVerifiedAt`, otherwise the old probe result keeps winning.
- Almost every subsystem reads its setting once at boot, so the panel reloads after an import. That
  reload sets `sessionStorage.graip_skipLeaveGuard = "1"`, which the two `beforeunload` handlers in
  `index.html` check (and `DOMContentLoaded` clears) so importing "confirm before leaving" does not
  block its own reload.
- The API never throws: no storage, quota exceeded or a missing `GraipLog` all degrade to a report.

## Panic and cloaking

- `panic.html` is the only page that must render **nothing** of graip. It loads `log.js` and
  `cloak.js` (for `safeUrl` and `blankDocument`) but sets `data-graip-no-auto-cloak="1"` on `<html>`
  so `cloak.js` does not overwrite its decoy title.
- The blackout is a `#blackout` overlay that is only removed once the target frame fires `load`
  (+ two RAFs for same-origin targets, + a timeout as the last resort). Never reveal the frame
  earlier: the whole feature exists so the proxy is never visible while the decoy loads.
- `GraipCloak.PROFILES` is the single list of disguises (9 profiles: None, Google, Google Docs,
  Google Drive, Google Classroom, Youtube, Canvas, Khan Acadamy, Desmos — the misspelling is in the
  storage key space, not a typo to fix casually). `dropdown.js` renders it,
  `panic.html` uses it, the `about:blank` window uses it. Add a profile there only.
- `GraipCloak.TARGETS` is the separate panic destination list (9: Classroom, Google, Docs, Drive,
  Canvas, Kahn Academy, Wikipedia, `about:blank`, Custom). Keys: `\`, `Escape`, `` ` ``, `~`, `]`,
  `z`, `q`, `Shift+Z`.
- Panic defaults: **off**, key `\`, destination Google Classroom, same-tab, decoy page on. A panic
  writes `sessionStorage.graip_panicReturn` so `browserfunctions.js` can wipe the tab session on the
  way back, and `clearBrowserTraces()` scrubs the address bar.
- Letter keys (`z`, `q`) must not fire while typing or with modifiers; `matches()` enforces this.

## Tabs and the omnibox

- Tab state lives in `bTabs`; the session is mirrored to `sessionStorage["graip_tabs:<pathname>"]`
  (`saveTabSession()` on every mutation + `pagehide`, throttled). Restored tabs are **lazy**: the URL
  stays in `tab.restoreUrl` and is only navigated when the tab is first shown.
- `pages/browser.html` calls `restoreTabSession()`; `browser-minimum.html`/`embed.html` call
  `newTab()`; an explicit `?launch=` always starts fresh.
- Omnibox: `installOmnibox()` (shortcuts) + `installOmniboxInput()` (bangs) run on DOMContentLoaded
  in `browserfunctions.js`. `resolveOmniboxInput()` is pure and unit-tested — extend the bang table
  there. Bangs: `!g !ddg !b !yt !w !gh !r`.
- `clearBrowserTraces()` / "Clear session traces" forgets the tab session, `graip_lastUrl` and the
  URL bar. Do not store visited URLs anywhere else.

## Small-screen and offline

- `assets/css/mobile.css` and the mobile section at the end of `styles/index.css` are **media-query
  only**. `tests/mobile-pwa.test.js` fails if a top-level rule appears there, so the desktop layout
  cannot regress by accident.
- `sw.js` caches only same-origin GETs outside `/~/sj/` and `/uv/service/` (`SHELL_ASSETS`,
  `graip-shell-v1`). Navigations are network-first with a cache fallback. Never cache proxied or
  cross-origin responses; bump `SHELL_CACHE` when the asset list changes.

## Code conventions

- Plain browser JS: no modules except `import("/libcurl/libcurl.mjs")`, no TypeScript, no framework.
  Alpine 3 (CDN) on `movies`/`watch`, hand-written DOM code elsewhere.
- 2-space indent in `assets/js`, 4-space indent in HTML, tabs in `sw.js` and vendored files. Match the
  surrounding file — this repo has three styles and that is fine.
- Personal/global state uses `localStorage` with the `graip_` prefix (`decoy` is the one exception,
  upstream's). Never reuse a `cherri_` key.
- **Every DOM/global lookup in shared scripts must tolerate absence.** A page that does not use a
  feature still loads the shared file, and one uncaught `TypeError` at top level kills the rest of
  that file for that page. Guard (`if (!el) return;`), do not assume.
- User-visible strings are short and sentence-cased without a trailing period on buttons ("Test
  current server", not "Test Server.").
- Comments explain *why* a workaround exists, not what the next line does. The existing comments are
  the reason this codebase is maintainable; add one when you encode a non-obvious constraint.

## UI conventions

- Settings panels are `#settings-{general,gaming,cloaking,backup,debug,proxy,info,updates}`. Sidebar
  entries carry `data-target` that must equal the panel suffix; deep links use
  `/?launch=1&settings=1&section=proxy`. `switchSettingsPage()` ignores unknown targets instead of
  blanking the area — keep that behaviour.
- Loaded pages are iframes inside `#contentFrame`; a page-local "Settings" link must be
  `/?launch=1&amp;settings=1` with `target="_top"`.
- Reloading a proxied tab goes through `go(tab.url, tabId)` after `ensureTransport(true)`. Never
  assign `iframe.src` directly: the SW error page and the controller cache both depend on `go()`.
- Toasts: `showToast(type, message, iconClass)` from `t.js`.
- New toggles: put `<div class="graip-toggle-slot" data-slot="name"></div>` in the panel and mount a
  clone in `debug-panel.js`. Do not copy the 40-line SVG switch markup by hand.
- New dropdowns: `<select class="settings-select">` is styled and used by the panic controls; the
  custom `.x-selector` components are only worth it for ones with icons.

## Testing and verification

```bash
node --test tests/*.test.js      # the only supported command; must stay green (106 tests)
```

No network access is needed (or allowed) for the suites. They run in a `vm` context with mocked
DOM/`localStorage`/`WebSocket`, so:

- arrays created inside the context have a different `Array.prototype`; compare with
  `JSON.stringify`, not `assert.deepStrictEqual`;
- workers (`sw.js`) need `importScripts` and `self.addEventListener` mocks;
- when a suite parses HTML, assert on strings (for example "does this page include
  `id="css-theme-link"`") rather than booting a DOM.

For behavioural checks, an out-of-tree jsdom harness works well:

```bash
python3 -m http.server 8899 --bind 0.0.0.0 &     # from the repo root
cd /tmp/verify && npm i jsdom@24                  # throwaway, never committed
```

Harness notes:

- `process.on("unhandledRejection", () => {})` is mandatory: jsdom surfaces page errors as unhandled
  rejections and will otherwise kill the process.
- Use `resources: "usable"` + `pretendToBeVisual: true`, wait for `load`, then ~300 ms before
  clicking (dropdowns populate asynchronously).
- Expect noise and filter it: `MessagePort`, `ServiceWorker`/`register`, `lucide`/`marked`/`io`/
  Tailwind CDN failures, WebGL, `canvas.getContext()` returning null, particles.js drawing. None of
  that is a site bug.
- Chromium/Playwright is not available here, so proxy traffic cannot be exercised end to end. Do not
  claim a proxy fix is "verified" — say what was and was not covered.

## Known traps

- Third-party endpoints `api.x8r.dev` (visitor counter, CometChat tokens, Hyperbeam) and the chat
  socket (`qs03x443-3000.usw3.devtunnels.ms`) are long dead. Features built on them must degrade with
  a visible message, not hang on a loader. The visitor counter now shows "—" and stops polling; chat
  shows a notice; `vm.js` no-ops.
- The movies grid talks to TMDb with a public key. The host is `api.themoviedb.org`; `api.tmdb.org`
  does not serve the API. Streams come from `iframe.pstream.mov`, `multiembed.mov` and vidsrc.
- CDN dependencies (Alpine, Tailwind, `marked`, `lucide`, KaTeX, `socket.io`, `emoji-mart`,
  `eruda`, fonts) fail on filtered networks. Any feature that needs them must check for the global
  before using it.
- `stores/ucp-games/*`, `homework/math.all.js`, `assets/icons/fonts/index.html`, `start.html` and
  `pages/classroom.html` are huge vendored files: greps and diffs against them are noise.
- `start.html` contains upstream metadata with a real Gmail address in a `og-profile-acct` meta tag,
  and `index.html` still points `og:image`/`twitter:image` at `https://cherri.x8r.dev`. Both are
  upstream leftovers: change them to your own deployment if link previews matter, and do not treat
  the address as this project's.
- The repo's `main` history is a single commit; diff against `https://github.com/x8rr/cherri`
  (shallow clone) to see what this fork changed. **The nightly `sync-fork.yml` workflow syncs the
  default branch from upstream**, so fork work belongs on a branch, never on `main`.
- `tests/site-wiring.test.js` enforces the invariants that were already broken once: the Movies tab
  opens the built-in page, side menus deep-link to `/?launch=1&settings=1`, and every
  `navTo()`/`switchSettingsPage()` target exists.
- `tests/panic-log.test.js` (log filtering/redaction, panic key matching, panic navigation, panic page
  structure, cloak profiles, tab restore, omnibox) and `tests/mobile-pwa.test.js` (media-query-only
  CSS, manifest, service worker shell caching, library hygiene) cover the features added on top of
  the fork. Both load the real modules into a `vm` context with a fake DOM/storage; prefer extending
  them over adding a new harness.
- `tests/settings-io.test.js` covers the settings file format: the allowlist, per-type validation
  (`javascript:` icons, non-websocket Wisp URLs), partial imports, ignoring runtime keys, reset
  semantics, and the no-storage / no-logger failure paths.
- Anything that changes the top-level URL, title or storage must also update `AGENTS.md`: the
  cloaking story is easy to break silently.

## Repo sweep

A file-by-file pass (every first-party file read, every vendored tree counted) produced this
inventory. Numbers are from the current tree; treat them as a snapshot, not a contract.

| Area | Files | Size | Editable? |
| --- | --- | --- | --- |
| `stores/ucp-games/` | 6,402 | 2.4 GB | No — vendored games (54 folders, biggest: `owt2/index.pck` 70 MB, `html/gd.html` 49 MB) |
| `stores/gn-math/` | 624 | 13 MB | No — vendored single-file games |
| `assets/img/` | 811 | 237 MB | Yes for adding icons; don't re-encode existing art |
| `assets/fonts/` | 25 | 9 MB | No — licensed fonts |
| `fa/` | 409 | 14 MB | No — Font Awesome Free 7.1.0 |
| `assets/icons/fonts/` | 15 | 13 MB | No — Remix Icon 4.7.0 (+ 2 MB of vendor demo HTML) |
| `tests/` | 13 | 120 KB | Yes — this is the source of truth for behaviour |
| `pages/` | 15 | 1.7 MB | Yes (except `classroom.html`) |
| `assets/css/` + `styles/` | 26 | 76 KB | Yes |
| `assets/js/` | 19 | 1.3 MB | Yes, except `lib/` |
| `homework/`, `uv/`, `baremux/`, `libcurl/` | 22 | 8.3 MB | No — vendored proxy runtime |
| `docs/` | 1 | 24 KB | Reference only |
| `.github/` | 1 | 1 KB | The nightly sync workflow |
| Root files | 13 | ~2 MB (mostly `start.html`, 1.9 MB) | Yes, except `LICENSE` |

Everything else in the tree is either an image, a font, or a vendored game's own asset — there is no
hidden build directory, no generated code, and no file that exists only to satisfy a tool.

### Findings from that sweep (none of these are urgent; all are real)

1. **`assets/js/chatrooms.js` is dead code.** No page includes it; `chatrooms.html` implements its own
   socket.io client. Keep it or delete it, but do not "fix" it expecting chat to come back.
2. **`assets/js/lib/detectmobile.js` is only used by vendored GN-Math pages**, never by first-party pages.
3. **`assets/css/themes/mint.css` exists but is not offered** in the theme dropdown
   (`allThemeOptions` in `dropdown.js` lists 15 themes + `default`). Add `"mint"` there if you want it
   reachable; `settings-io.js` will happily import it either way.
4. **`assets/json/partners.json` is inconsistent**: the Hydra Network entry points at
   `https://prism.onl/` and reuses `prism.png` although `assets/img/partners/hydra.png` exists. The
   Hydra tile in `index.html` uses `hydra.png` directly, so the two disagree.
5. **`index.html` has a stray `</html>` at line 64**, before the manifest/theme `<link>` tags that
   were appended inside `<head>`. Browsers recover, but new head tags should go above it.
6. **`pages/classroom.html` (37,761 lines) is unreachable** — not in nav, not referenced. It is a
   second Classroom copy kept from upstream. `start.html` is the one that actually gets shown.
7. **`pages/gmbl.html` is only reachable by URL**: its sidebar entry is commented out in
   `index.html`. Left in place deliberately.
8. **The settings sidebar has an icon-font mismatch**: it asks for `far fa-cog`, `far fa-bug`,
   `far fa-hood-cloak`, `far fa-bell-on` etc., while the bundled font is Font Awesome **Free**, which
   has no regular/pro variants for several of those, so some icons render blank. Adding icons means
   using a name that exists in `fa/css/all.min.css` (`fa-floppy-disk` does, `fa-cog` does not).
9. **Two identical `beforeunload` handlers** exist in `index.html`; both now honour
   `graip_skipLeaveGuard`. If you add a third guard, check that flag.
10. **`settings.js` is still loaded by 96 vendored store pages** that define neither `GraipWisp` nor
    any settings markup — this is why every lookup in it is optional and must stay that way.
11. **Visitors counter and chat endpoints are dead** (see Known traps). Both now fail visibly instead
    of throwing.
12. **`404.html` carries unreachable navigation JS**: `navTo()`, `rSearch()` and `toast()` survive
    from the old shell, but the page has no `#homesearch` input and no nav links. `rSearch()` used to
    point at the never-existing `/pages/ultraviolet.html`; it now points at `pages/browser.html`, which
    is what it should use if the search box is ever restored. `tests/site-wiring.test.js` now fails on
    any `/pages/*.html` reference that does not exist.
13. **The fog background is the only WebGL dependency**, and a throw from `VANTA.FOG()` used to abort
    the rest of that `<script>` block (visitor counter, Wisp status, settings wiring) on devices
    without WebGL. It is now wrapped in `try/catch` and logs a warning.
14. **No CI runs the tests.** `.github/workflows/` only syncs the fork. If you add a workflow, keep it
    dependency-free: `node --test tests/*.test.js` needs nothing installed.

### What a careful change looks like

1. Read the file you are about to change **and** the section of this document that covers it.
2. Change the smallest thing that works; nothing in `stores/`, `uv/`, `baremux/`, `libcurl/`,
   `homework/`, `fa/` or `assets/icons/` is yours to clean up.
3. Add or extend a test under `tests/` when behaviour changes (not when only styling changes).
4. Run `node --test tests/*.test.js` until it is 106/106.
5. If the change is user-visible, verify it in a jsdom harness against `python3 -m http.server`, and
   say plainly what was and was not covered.
6. Log it: a new action or failure path means a `GraipLog` call and, if the panel needs to show it, a
   `debug-panel.js` hook. If it is a preference that should survive a backup, a `SCHEMA` row in
   `settings-io.js`.
7. Update this document (layout, contracts, traps, sweep findings) in the same commit.
