"use strict";

/**
 * Site-level wiring checks for the homepage shell and the pages it loads into
 * the content frame. Game/store bundles under stores/ are third-party drops and
 * are intentionally out of scope.
 *
 * These exist because the rebrand from Cherri to Graip (plus the tab-bar edits)
 * broke things that no unit test touched:
 *   - the Movies tab on the homepage pointed at an external site instead of
 *     opening the built-in movie browser;
 *   - the Settings entry in the Games/Apps/Partners/Movies side menus pointed at
 *     /pages/settings.html, which has never existed in this repository;
 *   - two settings sidebar buttons addressed panel ids that did not exist, so
 *     clicking them blanked the whole settings area.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

/**
 * Every page this site owns. `stores/` is vendored game content, and
 * `start.html` is the Google Classroom disguise (a copy of Classroom's own
 * markup whose links are decoration, not routes), so neither is checked here.
 */
const PAGES = ["index.html", "404.html", "newtab.html"].concat(
  fs
    .readdirSync(path.join(ROOT, "pages"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => `pages/${file}`)
);

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function exists(ref) {
  const clean = ref.split(/[?#]/)[0];
  if (!clean || clean.endsWith("/")) return true;
  return fs.existsSync(path.join(ROOT, clean.replace(/^\//, "")));
}

test("local asset references in first-party pages resolve", () => {
  const missing = [];

  for (const page of PAGES) {
    const source = read(page);
    const pattern = /(?:src|href)\s*=\s*"(\/[^"#?]*)"/g;
    let match;

    while ((match = pattern.exec(source))) {
      // protocol-relative URLs are external
      if (match[1].startsWith("//")) continue;
      if (!exists(match[1])) missing.push(`${page} -> ${match[1]}`);
    }
  }

  assert.deepEqual(missing, [], `broken first-party references:\n${missing.join("\n")}`);
});

test("homepage top bar opens the built-in movie browser", () => {
  const source = read("index.html");

  assert.match(
    source,
    /<a onclick="navTo\('movies'\)" href="#" data-page="movies">/,
    "the Movies tab must navigate to the built-in movies page"
  );
  assert.doesNotMatch(
    source,
    /stellar\.gdn/,
    "the Movies tab should not hand traffic to an external site"
  );
  assert.ok(
    fs.existsSync(path.join(ROOT, "pages/movies.html")),
    "pages/movies.html is the page the Movies tab loads"
  );
});

test("every navTo('page') target exists", () => {
  const missing = [];
  const pattern = /navTo\('([^']+)'\)/g;

  for (const page of PAGES) {
    const source = read(page);
    let match;

    while ((match = pattern.exec(source))) {
      const target = match[1];

      // home handling and pre-built play URLs are not page names
      if (target.startsWith("home")) continue;
      if (target.includes(".html")) continue;

      if (!fs.existsSync(path.join(ROOT, "pages", `${target}.html`))) {
        missing.push(`${page} -> pages/${target}.html`);
      }
    }
  }

  assert.deepEqual(missing, [], `navTo targets without a page:\n${missing.join("\n")}`);
});

test("side menus open the real settings panel", () => {
  const embedded = [
    "pages/apps.html",
    "pages/games.html",
    "pages/partners.html",
    "pages/movieframe.html",
  ];

  for (const page of embedded) {
    assert.doesNotMatch(
      read(page),
      /href="\/pages\/settings\.html"/,
      `${page} links to a settings page that does not exist`
    );
    assert.match(
      read(page),
      /href="\/\?launch=1&amp;settings=1" target="_top"/,
      `${page} should deep link to the homepage settings panel`
    );
  }

  // ...and the homepage has to understand that deep link.
  const home = read("index.html");
  assert.match(home, /params\.get\("settings"\)/);
  assert.match(home, /params\.get\("launch"\)/);
});

test("settings sidebar targets real panels", () => {
  const home = read("index.html");
  const panelIds = new Set(
    Array.from(home.matchAll(/id="settings-([a-z-]+)"/g), (m) => m[1])
  );
  const targets = new Set(
    Array.from(home.matchAll(/data-target="([a-z-]+)"/g), (m) => m[1])
  );

  assert.ok(panelIds.size >= 5, "expected the settings panels to exist");

  for (const target of targets) {
    assert.ok(
      panelIds.has(target),
      `settings sidebar target "${target}" has no #settings-${target} panel`
    );
  }

  // every switchSettingsPage('x') literal must address a panel too
  for (const [, target] of home.matchAll(/switchSettingsPage\('([a-z-]+)'\)/g)) {
    assert.ok(
      panelIds.has(target),
      `switchSettingsPage('${target}') addresses a missing panel`
    );
  }
});

test("scramjet and ultraviolet service workers are both registered where the browser runs", () => {
  for (const page of ["index.html", "pages/browser.html", "pages/browser-minimum.html"]) {
    const source = read(page);
    assert.match(source, /\/sw\.js/, `${page} never registers Scramjet's worker`);
  }
  assert.match(read("index.html"), /\/uv\/sw\.js/);
});

test("no first-party page navigates to a page that does not exist", () => {
  // 404.html used to send searches to /pages/ultraviolet.html, a file that has
  // never existed here, so every search from the not-found page hit a 404.
  const seen = new Set();
  const broken = [];

  for (const page of PAGES.concat("panic.html")) {
    const source = read(page);
    for (const [, target] of source.matchAll(/["'`]\/?(pages\/[A-Za-z0-9_-]+\.html)/g)) {
      seen.add(target);
      if (!exists(target)) broken.push(`${page} -> ${target}`);
    }
  }

  assert.deepEqual(broken, [], `pages referenced but missing: ${broken.join(", ")}`);
  assert.ok(seen.has("pages/browser.html"), "expected the browser page to be referenced somewhere");
  assert.ok(seen.has("pages/play.html"), "expected the play page to be referenced somewhere");
});

test("the visitor counter degrades instead of throwing when its endpoint is gone", () => {
  const home = read("index.html");

  // the endpoint belongs to the upstream author and no longer answers
  assert.match(home, /api\.x8r\.dev\/api\/umami/);
  const block = home.slice(home.indexOf("async function getActiveUsers"), home.indexOf("userCountTimer = setInterval"));
  assert.match(block, /try \{/, "the counter fetch must be guarded");
  assert.match(block, /catch \(error\)/, "a dead endpoint must not become an unhandled rejection");
  assert.match(block, /clearInterval\(userCountTimer\)/, "a dead endpoint should stop being polled");
  assert.match(block, /GraipLog/, "the failure must be recorded in the debug log");
});
