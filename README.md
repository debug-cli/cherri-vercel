<div align="center">

<h1>graip</h1>

<p>
  A static, deploy-anywhere web proxy and game site: 700+ games, a real multi-tab proxy browser,
  a movie browser, a panic key, and a debug log you can hand to a maintainer.
</p>

<p>
  <a href="https://github.com/debug-cli/cherri-vercel/blob/main/LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-e2588d"></a>
  <img alt="No build step" src="https://img.shields.io/badge/build-none-brightgreen">
  <img alt="Tests" src="https://img.shields.io/badge/tests-106%20passing-brightgreen">
  <img alt="Proxy" src="https://img.shields.io/badge/proxy-Scramjet%20%2B%20Ultraviolet-blueviolet">
  <img alt="Transport" src="https://img.shields.io/badge/transport-libcurl.js%20%2B%20Wisp-informational">
</p>

<p>
  <b>Deploy in one click</b><br>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/debug-cli/cherri-vercel"><img alt="Deploy to Vercel" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/vercel.svg" height="40"></a>
  <a href="https://app.netlify.com/start/deploy?repository=https://github.com/debug-cli/cherri-vercel"><img alt="Deploy to Netlify" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/netlify.svg" height="40"></a>
  <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages/create"><img alt="Deploy to Cloudflare Pages" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/cloudflarepages.svg" height="40"></a>
  <a href="https://github.com/debug-cli/cherri-vercel/fork"><img alt="Deploy to GitHub Pages" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/github.svg" height="40"></a>
  <a href="https://render.com/deploy?repo=https://github.com/debug-cli/cherri-vercel"><img alt="Deploy to Render" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/render.svg" height="40"></a>
  <a href="https://railway.app/new/template?template=https://github.com/debug-cli/cherri-vercel"><img alt="Deploy on Railway" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/railway.svg" height="40"></a>
  <a href="https://replit.com/github/debug-cli/cherri-vercel"><img alt="Run on Replit" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/replit.svg" height="40"></a>
  <a href="https://glitch.com/edit/#!/import/github/debug-cli/cherri-vercel"><img alt="Remix on Glitch" src="https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg" height="40"></a>
</p>

<p>
  <a href="#features">Features</a> ·
  <a href="#how-it-differs-from-other-proxies">Why this one</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#deploy">Deploy</a> ·
  <a href="#self-hosting-a-wisp-server">Wisp</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#credits">Credits</a>
</p>

</div>

---

## What this is

graip is a **fully static** site — HTML, CSS, JS, WASM and game files, no server, no build step, no
`npm install`. Drop the folder on any static host (or open it behind `python3 -m http.server`) and
you get a proxy that runs entirely in the browser tab.

The proxying is done by [Scramjet](https://github.com/MercuryWorkshop/scramjet) and
[Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet), with
[libcurl.js](https://github.com/ading2210/libcurl.js) compiled to WebAssembly carrying the actual
HTTPS traffic through a [Wisp](https://github.com/MercuryWorkshop/wisp-protocol) WebSocket server.

> Because there is no backend, **graip does not ship a proxy server**. It needs a Wisp endpoint —
> either a public one from the built-in list, or one you host yourself (see
> [Self-hosting a Wisp server](#self-hosting-a-wisp-server)).

---

## Features

### Proxy and browsing
- **Two proxy backends** — Scramjet (default, newest) and Ultraviolet (legacy fallback), switchable
  in Settings → Proxy.
- **Multi-tab browser** with per-tab history, back/forward/reload, fullscreen and a devtools button.
- **Tab sessions survive a reload** — open tabs come back (in that window only) after a refresh or a
  crash, and are forgotten when the window closes.
- **Omnibox shortcuts** — `Ctrl/⌘+L` focus the address bar, `Ctrl/⌘+T` new tab, `Ctrl/⌘+W` close,
  `Ctrl/⌘+Shift+T` reopen, `Alt+←/→` history. Search bangs: `!g`, `!ddg`, `!b`, `!yt`, `!w`, `!gh`, `!r`.
- **Wisp management built in** — 30+ known endpoints, a real handshake probe (not just "the socket
  opened"), automatic failover, and a picker that still shows *your* choice while a fallback is live
  (`Anura 1 → Phantom`).
- **Honest error pages** — TLS failures (curl 35/60), unreachable routes (curl 7) and missing WASM
  are classified, retried on another route a bounded number of times, and explained. Certificate
  verification is never disabled to "fix" a site.

### Cloaking and privacy
- **Panic key** — one key press replaces the tab with a decoy site, and the screen stays **black
  until the destination has finished loading**. Nothing from graip (no proxy, no half-loaded frame)
  is ever visible during the panic. `Esc` on the decoy goes back.
- **Tab cloaking profiles** — title + favicon + the fake page shown inside the `about:blank` window,
  so the decoy tab isn't a blank page labelled "Google".
- **about:blank mode** with an optional *auto about:blank* on every visit.
- **Session traces** — the current URL is scrubbed from the address bar, and a panic wipes the stored
  tab session.
- No analytics of proxied traffic; the debug log never records query strings.

### Everything else
- **700+ games** across two bundled stores (Classplay/UCP and GN-Math), 40+ apps, searchable menus,
  and a placeholder instead of a blank tile when a thumbnail is missing.
- **Movie browser** — TMDb search/browse with a page-level error state when the API is unreachable.
- **AI assistant**, **chatrooms**, **VMs**, **partners** pages.
- **Extensive settings** — 16 themes, particles/fog, custom cursor, game overlay, confirm-on-leave,
  search engine, game store, backend, Wisp.
- **Backup & restore** — save every setting to one JSON file and load it on another device (see below).
- **Debug log** — see below.
- **Installable PWA** with an offline shell: if the network is filtered after the first visit, the UI
  still loads so you can reach Settings → Proxy.

### Settings backup (export / import)
Settings → **Backup** writes every preference — theme, fog, cursor, cloak and panic options, Wisp route,
backend, search engine, game store and logging — to a single `graip-settings-<date>.json` file, and
reads one back. Three things worth knowing:

- the file is an **allowlist**: preferences only. It never contains open tabs, history, the debug log
  or the game-library health report, and a hand-edited file cannot write a key the site does not own;
- every value is **re-validated on the way in**, so a shared config cannot smuggle in a `javascript:`
  favicon or a non-websocket Wisp URL — bad entries are skipped and reported, the rest still apply;
- a **partial file is a valid file**, so a two-line JSON snippet works as a patch, and importing text
  from the clipboard (Settings → Backup → *Restore from text*) needs no download at all.

Everything reloads after an import, because almost every subsystem reads its setting once at boot.
*Reset all settings* restores the shipped defaults and leaves the log and your open tabs alone.

### Debug log (exportable)
Settings → **Debug** records everything that happens: navigation, settings changes, Wisp probes,
route recovery, proxied requests (reported by the service worker), network failures and every
uncaught error. Verbose mode is **on by default** and keeps warnings/errors even when turned off.

Export it as **JSON** or **TXT**, or copy it to the clipboard — one file is usually enough to explain
why a site is "broken" on a school network.

The same panel has **Library health**: on-demand validation of the bundled game/app lists (shape,
duplicates, missing thumbnails).

---

## How it differs from other proxies

Most game/unblocker sites in this space (Nebula, Holy Unblocker, Rammerhead-fronted sites,
Interstellar, various forks) share the same shape: a proxy, a game grid, and a settings modal. graip
runs on that same foundation — it is a fork of [Cherri](https://github.com/x8rr/cherri) — and differs
in the parts that decide whether it *works* when you need it:

| | Typical proxy site | graip |
| --- | --- | --- |
| **Dead Wisp endpoint** | Every request fails with "error code 7" until the maintainer updates a hardcoded URL | Probes the handshake, fails over to another endpoint automatically, keeps your saved choice, and shows which route is live |
| **TLS / SSL errors on a site** | "Site doesn't work", nothing to act on | curl 35/60/7 are detected, tried on a different route, and explained — with certificate verification kept on |
| **Panic key** | Redirects to Google and flashes the proxy while it loads | Black screen until the decoy has loaded, then the decoy; `Esc` returns |
| **Cloaking** | Favicon + title only, so the tab is titled "Google" with a blank page | Profiles bundle title + favicon + decoy page content |
| **Debugging** | Console only, and the console closes with the tab | Exportable JSON/TXT log of every action, request and error, written to a file from Settings |
| **Offline / filtered network** | Blank page, no way into Settings | Cached app shell still boots |
| **Deployment** | Sometimes needs a Node build, a server, or a specific host | Pure static files; deploys to Vercel, Netlify, Cloudflare Pages, GitHub Pages, Render, Railway, or `python3 -m http.server` |
| **Mobile** | Desktop-only chrome | Purpose-built small-screen layout (bottom nav, stacked tabs, full-width frames) |
| **Tests** | Usually none | `node --test tests/*.test.js`, 106 dependency-free tests covering the proxy, Wisp handling, panic, logging, sessions, settings backup, PWA shell and site wiring |

What it is **not**: it is not a VPN, it does not host a proxy server, it does not bypass a network
that blocks WebSockets entirely, and it cannot make a dead Wisp endpoint work.

---

## How it works

```
browser tab
 ├─ index.html                  app shell: menus, settings, game/app lists
 ├─ pages/browser.html          proxy browser (tabs, omnibox, frames)
 ├─ sw.js                       service worker: Scramjet routing, ad filter, error pages, shell cache
 ├─ homework/*.js               Scramjet runtime (disguised filenames)
 ├─ uv/                         Ultraviolet runtime + its own worker
 ├─ libcurl/                    libcurl.js 0.7.5 compiled to WASM (HTTPS client)
 └─ assets/js/wisp.js           Wisp endpoint list, probing, failover
        │
        └── WebSocket ──► Wisp server ──► the site you asked for
```

1. The page asks `wisp.js` for an endpoint that answers a Wisp handshake, trying the configured one
   first and then the pool.
2. libcurl (inside the tab, inside a Web Worker) opens a TCP stream through that endpoint and
   performs the TLS handshake itself.
3. Scramjet rewrites the HTML/CSS/JS that comes back and serves it from `/~/sj/…` via the service
   worker, so the target site behaves as if it were same-origin.

Everything except the Wisp hop happens on the client.

### Repository layout

| Path | Contents |
| --- | --- |
| `index.html` | App shell, sidebar, settings, game/app loader |
| `pages/` | Browser, mini-browser, embed, play, movies, watch, apps, games, chat, VMs, assistant |
| `assets/js/` | `wisp.js`, `browserfunctions.js`, `cloak.js`, `log.js`, `dropdown.js`, `proxy-errors.js`, … |
| `assets/json/` | Game/app lists (`classplay.json`, `gn-math.json`, `apps.json`) |
| `libcurl/` | Generated libcurl.js bundles (do not hand-edit) |
| `uv/`, `baremux/`, `homework/` | Proxy runtimes |
| `stores/` | Bundled game stores |
| `tests/` | `node --test` suites |
| `panic.html` | The decoy page used by the panic key |
| `manifest.json` | PWA manifest |

---

## Deploy

### One click

Use any button at the top of this file. Vercel, Netlify and Cloudflare Pages need no configuration —
there is no build command and no output directory; the repository root *is* the site.

### Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git, then:

- Framework preset: **None**
- Build command: *(empty)*
- Output directory: `/`

> Cloudflare Pages has a 25 MB per-asset limit. `stores/ucp-games/` contains a few large game files;
> if the upload fails, deploy the GN-Math store only (Settings → Gaming → Game Library lets users pick,
> and `assets/json/gn-math.json` works on its own).

### Vercel CLI

```sh
npm i -g vercel
vercel            # preview
vercel --prod     # production
```

No `vercel.json` is required. `vercel.json` in this repo only sets long-lived cache headers for
immutable assets if you want them.

### GitHub Pages

Push to a repository, then Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
Everything is relative-friendly except `sw.js` and the proxy prefixes, which need to be served from
the site root — so a project page (`user.github.io/repo/`) will break the service worker. Use a user
page or a custom domain.

### Self-hosted / local

```sh
git clone https://github.com/debug-cli/cherri-vercel.git
cd cherri-vercel
python3 -m http.server 8080      # or: npx serve .
```

Then open <http://localhost:8080/?launch=1>. **`?launch=1` is required** — without it the site shows
the "Google Classroom" disguise page (`start.html`) by design.

A local server is also required for the service worker: `file://` will not work.

### Requirements for any host

- Must serve over **HTTPS** (or `localhost`) — service workers and Wisp `wss://` require it.
- Must serve `sw.js` from the **root scope**.
- Must not rewrite or intercept `/~/sj/`, `/uv/service/`, `/wisp/` paths.

---

## Self-hosting a Wisp server

Public endpoints are community-run and come and go. For a deployment you rely on, run your own:

```sh
git clone https://github.com/MercuryWorkshop/wisp-server-node
cd wisp-server-node
npm install
node index.js        # listens on :4000, endpoint is ws://localhost:4000/
```

Put it behind TLS (Caddy, nginx, Cloudflare tunnel) so the endpoint is `wss://your-host/` — note the
**trailing slash**: a Wisp endpoint always ends in `/`, unlike a wsproxy URL.

Then in graip: **Settings → Proxy → Custom server…** and enter `wss://your-host/`.

Docker example (behind Caddy):

```caddyfile
proxy.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

---

## Settings worth knowing

| Setting | Where | Why |
| --- | --- | --- |
| Wisp route + "Test current server" | Proxy | Pick an endpoint that answers on your network; the test only checks the handshake, not whether a specific site will work |
| Backend (Scramjet / Ultraviolet) | Proxy | Try the other one when a site misbehaves |
| Panic key | Cloaking | Choose the key, the destination, whether it replaces this tab or opens another, and whether the decoy page is shown |
| Auto about:blank | Cloaking | Moves the site into an `about:blank` tab on every visit |
| Clear session traces | Cloaking | Forgets open tabs and the scrubbed URL |
| Verbose logging + Export | Debug | Turn the log down, or export it as JSON/TXT |
| Check library now | Debug | Validates the bundled game/app lists and thumbnails |
| Save settings file / Restore | Backup | Move every preference to another device or back; partial files patch, they do not wipe |
| Reset all settings | Backup | Back to shipped defaults without touching the log or open tabs |

---

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| "error code 7 / could not reach its proxy server" | The Wisp endpoint is down or blocked | Settings → Proxy → test another route, or self-host one |
| "error code 60 / TLS peer could not be verified" | The destination's certificate chain, your clock, or route interception (school SSL inspection) | Try another route; graip never disables certificate checks |
| Everything loads but sites hang | Network blocks WebSockets | Nothing client-side can fix this; use a Wisp endpoint on port 443 |
| Blank page after deploy | Deployed to a subpath, or `sw.js` is not at the root | Deploy at the domain root; project pages break the worker |
| Redirected to a Classroom lookalike | You opened the site without `?launch=1` | Append `?launch=1` (that page is the disguise) |
| Games list empty | A store JSON failed to load | Settings → Debug → Check library now |
| Chat / VMs / AI do not connect | Their third-party backends are dead | Expected; the UI reports it instead of hanging |

If none of that helps: **Settings → Debug → Export JSON** and attach the file to an issue. It contains
no query strings and no page contents.

---

## Development

There is no build step and no package manifest.

```sh
python3 -m http.server 8080     # serve the repo root
node --test tests/*.test.js     # 106 tests, no dependencies, no network
```

Guidelines, architecture notes and known traps are in [`AGENTS.md`](./AGENTS.md).

---

## Credits

graip would not exist without the people who built the pieces:

- **[x8r](https://github.com/x8rr)** — author of **[Cherri](https://github.com/x8rr/cherri)**, the
  original project this repository is forked from. The layout, the menus, the game stores, the
  browser chrome, the settings design and most of the code you see came from Cherri. Thank you.
  Cherri itself was a rebuild of Breeze.
- **[MercuryWorkshop](https://github.com/MercuryWorkshop)** — [Scramjet](https://github.com/MercuryWorkshop/scramjet),
  [Wisp](https://github.com/MercuryWorkshop/wisp-protocol), [bare-mux](https://github.com/MercuryWorkshop/bare-mux)
  and the [libcurl transport](https://github.com/MercuryWorkshop/libcurl-transport).
- **[ading2210](https://github.com/ading2210)** — [libcurl.js](https://github.com/ading2210/libcurl.js).
- **[Titanium Network](https://github.com/titaniumnetwork-dev)** — [Ultraviolet](https://github.com/titaniumnetwork-dev/Ultraviolet).
- **[waves.lat](https://waves.lat)** — the custom dropdown component.
- **[binbashbanana](https://github.com/BinBashBanana)** — the deploy buttons and the game store format
  used across this whole scene.
- Remix Icons, Font Awesome, Vanta.js, particles.js, Alpine.js, Tailwind, marked, KaTeX, highlight.js
  and every community member who runs a public Wisp endpoint.

### FORK NOTICE

This repository is a fork of **[x8rr/cherri](https://github.com/x8rr/cherri)** (AGPL-3.0). All
original code was written by x8r. Changes made in this fork:

- Rebranded Cherri → graip (display text, `localStorage` keys, globals, titles)
- Default theme `midnight`, and the theme link wired on every page
- **Wisp handling rewritten** — real handshake probing, endpoint presets, automatic failover that
  never overwrites the user's saved choice, "chosen → fallback" picker label
- **SSL/TLS failures classified and retried** (curl 35/60/7) with explanations; certificate
  verification kept enabled
- **libcurl.js upgraded to 0.7.5** and `libcurl-transport` to 2.0.6 (updated CA store, new curl),
  with a load timeout and `libcurl_abort` handling instead of a silent hang
- **Panic key + blackout decoy page** (`panic.html`), cloak profiles, auto-`about:blank`
- **Exportable debug log** (verbose on by default) and a Debug settings panel
- **Tab sessions restored after reload**, omnibox shortcuts and search bangs
- **Mobile layout** (desktop unchanged)
- **PWA + offline shell** cache in the service worker
- **Settings backup** — export/import every preference as one JSON file, with per-value validation
- Fixed: Movies tab opened an external site; settings sidebar blanked the panel; side-menu settings
  links pointed at a nonexistent page; movies called `api.tmdb.org`; chat hung on its loader;
  shared scripts threw on pages without their markup; `sw.js` never called `skipWaiting()`
- Library hygiene: missing thumbnails get a placeholder and are reported
- Added `tests/` (106 tests) and `AGENTS.md`

Upstream: <https://github.com/x8rr/cherri>

---

## License

**AGPL-3.0**. See [LICENSE](./LICENSE).

If you deploy or fork this project you must keep the license, keep the credit to x8r/Cherri and the
upstream projects above, and publish your modifications (AGPL §13 covers network use). Do not claim
this code as your own.

## Disclaimer

graip is a general-purpose proxy front-end. It is not affiliated with, endorsed by, or operated by
any school, and it is not a tool for evading a lawful network policy. You are responsible for how you
use it and for the laws and acceptable-use policies that apply to you. The maintainers host no proxy
server and cannot see your traffic.
