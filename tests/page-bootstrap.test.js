"use strict";

/**
 * Pages must tolerate the parts of the app they do not use.
 *
 * The browser pages, the VM page and the 404 page all load shared scripts whose
 * old versions assumed markup or globals were present. A single uncaught error
 * on load took out the rest of the file, which is how a missing bare-mux worker
 * or a missing theme hook turned into a completely dead page.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

const PAGES = ["index.html", "404.html", "newtab.html"].concat(
  fs
    .readdirSync(path.join(ROOT, "pages"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => `pages/${file}`)
);

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

test("pages that apply the saved theme expose the stylesheet hook", () => {
  for (const page of PAGES) {
    const source = read(page);
    if (!source.includes("/assets/js/colors.js")) continue;

    assert.match(
      source,
      /id="css-theme-link"/,
      `${page} loads colors.js without #css-theme-link, so the saved theme is lost`
    );
  }
});

test("colors.js tolerates a missing theme link", () => {
  const source = read("assets/js/colors.js");
  assert.match(source, /if \(link && theme !== 'default'\)/);
});

test("browser helpers do not require bare-mux before the Scramjet path runs", () => {
  const source = read("assets/js/browserfunctions.js");

  assert.doesNotMatch(
    source,
    /^const connection = new BareMux\.BareMuxConnection/m,
    "bare-mux must be created lazily; an eager call aborts the whole file"
  );
  assert.match(source, /function getBareMuxConnection\(\)/);
  assert.match(source, /typeof BareMux === "undefined"/);
  assert.match(source, /const connection = getBareMuxConnection\(\);/);
});

test("the VM launcher no-ops when its markup is absent", () => {
  const source = read("assets/js/vm.js");

  assert.doesNotMatch(
    source,
    /^document\.getElementById\("create-btn"\)\.addEventListener/m,
    "the launcher must not bind to #create-btn unconditionally"
  );
  assert.match(source, /function vmEl\(id\)/);
  assert.match(source, /if \(button\) \{/);
});

test("pages that load the VM launcher may not ship the legacy launcher markup", () => {
  // both pages are iframe-based now; the launcher has to stay optional
  for (const page of ["pages/vms.html", "pages/assistant.html"]) {
    const source = read(page);
    if (!source.includes("/assets/js/vm.js")) continue;
    assert.doesNotMatch(source, /id="create-btn"/, `${page} has unexpected launcher markup`);
  }
});

test("shared scripts tolerate pages that do not use them", () => {
  const settings = read("assets/js/settings.js");

  assert.match(
    settings,
    /typeof GraipWisp !== "undefined"/,
    "settings.js is loaded by ~96 store pages that never define GraipWisp"
  );
  assert.match(settings, /if \(currentWisp\) currentWisp\.textContent/);

  const particles = read("assets/js/lib/particles.js");
  assert.match(
    particles,
    /if \(!t\) return;/,
    "particlesJS must not throw when the page has no container element"
  );
});

test("pages that start particles ship the container element", () => {
  for (const page of PAGES) {
    const source = read(page);
    if (!/particlesJS\.load\(['"]particles-container['"]/.test(source)) continue;

    assert.match(
      source,
      /id="particles-container"/,
      `${page} starts particles without a #particles-container element`
    );
  }
});

test("the movie browser talks to the real TMDb API host", () => {
  const movies = read("pages/movies.html");

  assert.doesNotMatch(
    movies,
    /api\.tmdb\.org/,
    "api.tmdb.org is not the TMDb API; every browse/search request failed"
  );
  assert.match(movies, /https:\/\/api\.themoviedb\.org\/3/);
  assert.match(read("pages/watch.html"), /api\.themoviedb\.org\/3/);
});

test("chat fails loudly instead of hanging on the loader", () => {
  const chat = read("pages/chatrooms.html");

  assert.match(chat, /function graipChatOffline\(message\)/);
  assert.match(chat, /typeof io !== "function"/);
  assert.match(
    chat,
    /const timer = setTimeout\(\(\) => resolve\(""\), 5000\)/,
    "getIP() must not await a socket that never answers"
  );
});

test("pages without the sidebar do not dereference it", () => {
  for (const page of ["pages/browser.html", "pages/play.html"]) {
    const source = read(page);

    // #nav-ul does not exist on either page, so every dereference needs a guard
    assert.match(
      source,
      /if \(!ul\) return/,
      `${page} dereferences the missing #nav-ul`
    );
  }
});

test("CDN globals are checked before use", () => {
  for (const page of ["index.html", "404.html"]) {
    assert.match(
      read(page),
      /if \(typeof lucide !== "undefined"\) lucide\.createIcons\(\);/,
      `${page} calls lucide.createIcons() unconditionally`
    );
  }

  const assistant = read("pages/assistant.html");
  assert.match(assistant, /if \(typeof marked !== "undefined"\) \{/);
  assert.match(assistant, /container\.textContent = processed;/);
  assert.match(assistant, /if \(typeof hljs !== "undefined"\)/);
  assert.match(assistant, /if \(typeof renderMathInElement !== "function"\) return;/);
});
