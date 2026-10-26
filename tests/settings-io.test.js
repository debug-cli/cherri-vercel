"use strict";

/**
 * Settings export / import (assets/js/settings-io.js).
 *
 * The module is loaded in a `vm` context with a fake localStorage so the
 * allowlist, the value validation and the merge semantics can be checked
 * without a browser. The important guarantees are:
 *   - a config file can only ever write keys from the schema;
 *   - a hostile or simply wrong value is skipped, never assigned;
 *   - a partial file is a patch, not a wipe;
 *   - import never throws, even with no storage and no logger.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "assets/js/settings-io.js");

/** Minimal localStorage that records writes, like a browser's. */
function makeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    map,
    writes: [],
    removed: [],
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      this.writes.push([key, String(value)]);
      map.set(key, String(value));
    },
    removeItem(key) {
      this.removed.push(key);
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Load the module with a stubbed environment.
 *
 * @param {object} [options]
 * @param {object} [options.seed] initial localStorage contents
 * @param {object} [options.inject] extra globals (document, Blob, ...)
 */
function load(options) {
  const opts = options || {};
  const localStorage = makeStorage(opts.seed);
  const entries = [];
  const sandbox = {
    localStorage,
    location: { reload() {
      sandbox.reloads += 1;
    }, origin: "https://graip.example" },
    URL,
    navigator: {},
    setTimeout,
    clearTimeout,
    console,
    reloads: 0,
  };

  sandbox.GraipLog = {
    debug: (category, message, data) => entries.push(["debug", category, message, data]),
    info: (category, message, data) => entries.push(["info", category, message, data]),
    warn: (category, message, data) => entries.push(["warn", category, message, data]),
    error: (category, message, data) => entries.push(["error", category, message, data]),
    action: (category, message, data) => entries.push(["action", category, message, data]),
  };

  Object.assign(sandbox, opts.inject || {});
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SOURCE, "utf8"), context, { filename: SOURCE });

  return { api: sandbox.GraipSettings, localStorage, entries, sandbox, context };
}

const KEY = (name) => name;

/**
 * Arrays and objects created inside the vm context have a different prototype,
 * so assert.deepEqual rejects them even when they hold the same values. Compare
 * their JSON instead.
 */
function sameList(actual, expected, message) {
  assert.equal(JSON.stringify(Array.from(actual)), JSON.stringify(expected), message);
}

function sameMap(actual, expected, message) {
  const sorted = (value) =>
    JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]])
    );
  assert.equal(sorted(actual), sorted(expected), message);
}

test("module exposes one API and no stray globals", () => {
  const { sandbox } = load();
  assert.equal(typeof sandbox.GraipSettings, "object");
  assert.equal(typeof sandbox.GraipSettings.download, "function");
  assert.equal(typeof sandbox.GraipSettings.import, "function");
  assert.equal(typeof sandbox.GraipSettingsUiCopy, "function");
  assert.equal(typeof sandbox.GraipSettingsUiReset, "function");
});

test("export carries a format, a version and only known keys", () => {
  const { api } = load({
    seed: {
      graip_theme: "void",
      graip_particlesOn: "no",
      graip_debugLog: "[]",
      graip_libraryIssues: "{}",
      "graip_tabs:/pages/browser.html": "[]",
      some_other_site_key: "keep out",
    },
  });

  const data = api.exportData();
  assert.equal(data.format, "graip-settings");
  assert.equal(data.version, 1);
  assert.match(data.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(data.settings[KEY("graip_theme")], "void");
  assert.equal(data.settings[KEY("graip_particlesOn")], "no");

  // runtime and diagnostic state must never travel
  for (const key of ["graip_debugLog", "graip_libraryIssues", "some_other_site_key"]) {
    assert.equal(data.settings[key], undefined, `${key} leaked into the export`);
  }
  assert.equal(
    Object.keys(data.settings).filter((key) => key.startsWith("graip_tabs")).length,
    0
  );
});

test("export skips stored values the schema would reject", () => {
  const { api } = load({
    seed: { graip_theme: "../../etc/passwd", graip_searchEngine: "Google" },
  });
  const settings = api.exportData().settings;
  assert.equal(settings.graip_theme, undefined);
  assert.equal(settings.graip_searchEngine, "Google");
});

test("round trip: export then import restores every value", () => {
  const seed = {
    graip_theme: "coral",
    graip_particlesOn: "no",
    graip_customCursor: "no",
    graip_wispUrlSelected: "Anura",
    graip_backend: "Ultraviolet",
    graip_searchEngine: "Brave",
    decoy: "Google Docs",
    graip_cloakTitle: "Untitled document",
    graip_cloakIcon: "/assets/img/cloaks/gdrive.png",
    graip_cloakProfile: "Google Docs",
    graip_panicEnabled: "yes",
    graip_panicKey: "Escape",
    graip_panicTarget: "Classroom",
    graip_panicOpenIn: "new-tab",
    graip_panicShowDecoy: "yes",
    graip_autoAB: "yes",
    graip_gameStore: "GN-Math",
    graip_useOverlay: "no",
    graip_confirmLeave: "yes",
    graip_verboseLogs: "off",
  };

  const first = load({ seed });
  const file = first.api.exportJSON();

  const second = load();
  const report = second.api.apply(file);

  assert.equal(report.ok, true);
  assert.equal(report.error, "");
  assert.equal(report.applied.length, Object.keys(seed).length);
  assert.equal(report.skipped.length, 0);
  assert.equal(report.unknown.length, 0);
  sameMap(second.api.collect(), seed);
});

test("a flat map of settings is accepted as a patch", () => {
  const { api, localStorage } = load({ seed: { graip_theme: "void", graip_backend: "Scramjet" } });
  const report = api.apply('{"graip_theme":"mint"}');

  assert.equal(report.ok, true);
  sameList(report.applied, ["graip_theme"]);
  // untouched keys stay put
  assert.equal(localStorage.getItem("graip_backend"), "Scramjet");
  assert.equal(localStorage.getItem("graip_theme"), "mint");
  assert.ok(report.warnings.some((warning) => /bare list/.test(warning)));
});

test("bad JSON and empty files are rejected without writing", () => {
  const { api, localStorage } = load({ seed: { graip_theme: "void" } });

  const broken = api.apply("{ not json");
  assert.equal(broken.ok, false);
  assert.match(broken.error, /valid JSON/);

  const empty = api.apply("   ");
  assert.equal(empty.ok, false);

  const noSettings = api.import(JSON.stringify({ format: "graip-settings", version: 1 }));
  assert.equal(noSettings.ok, false);
  assert.match(noSettings.error, /no settings/i);

  const blank = api.apply(JSON.stringify({ format: "graip-settings", version: 1, settings: {} }));
  assert.equal(blank.ok, false);

  assert.equal(localStorage.writes.length, 0, "a rejected file must not touch storage");
  assert.deepEqual(Array.from(localStorage.map.keys()), ["graip_theme"]);
});

test("numeric and array payloads are rejected rather than coerced", () => {
  const { api } = load();
  assert.equal(api.apply("42").ok, false);
  assert.equal(api.apply("[]").ok, false);
  assert.equal(api.apply("null").ok, false);
});

test("unknown keys are reported and do not block the rest", () => {
  const { api, localStorage } = load();
  const report = api.apply(
    JSON.stringify({
      format: "graip-settings",
      version: 1,
      settings: { graip_theme: "sea", not_a_setting: "x", "__proto__": 1 },
    })
  );

  assert.equal(report.ok, true);
  sameList(report.applied, ["graip_theme"]);
  sameList(report.unknown, ["not_a_setting"]);
  // "__proto__" would be an object key, not an own entry of the parsed JSON
  assert.equal(localStorage.getItem("not_a_setting"), null);
  assert.equal(localStorage.getItem("__proto__"), null);
});

test("runtime state is ignored, not imported", () => {
  const { api, localStorage } = load({ seed: { graip_wispUrl: "wss://old.example/" } });
  const report = api.apply(
    JSON.stringify({
      settings: {
        graip_wispUrl: "wss://attacker.example/",
        graip_debugLog: "[]",
        graip_libraryIssues: "{}",
        "graip_tabs:/": "[]",
        graip_theme: "lime",
      },
    })
  );

  assert.equal(report.ok, true);
  assert.ok(report.ignored.length >= 4);
  assert.equal(localStorage.getItem("graip_debugLog"), null);
  assert.equal(localStorage.getItem("graip_libraryIssues"), null);
  assert.equal(localStorage.getItem("graip_theme"), "lime");
  // the running endpoint is not overwritten mid-session
  assert.equal(localStorage.getItem("graip_wispUrl"), "wss://old.example/");
});

test("hostile values are skipped one by one", () => {
  const { api, localStorage } = load();
  const report = api.apply(
    JSON.stringify({
      settings: {
        graip_cloakIcon: "javascript:alert(1)",
        graip_cloakTitle: "<img src=x onerror=alert(1)>",
        graip_theme: "../../evil",
        graip_backend: "Scramjet",
        graip_panicKey: "  ",
        graip_panicOpenIn: "sideways",
        graip_particlesOn: "maybe",
        graip_wispUrlCustom: "https://not-a-wisp.example/",
      },
    })
  );

  assert.equal(report.ok, true);
  sameList(report.applied, ["graip_backend"]);
  assert.equal(report.skipped.length, 7);
  for (const item of report.skipped) {
    assert.equal(typeof item.reason, "string");
    assert.ok(item.reason.length > 0);
    assert.equal(localStorage.getItem(item.key), null, `${item.key} was written anyway`);
  }
  assert.equal(localStorage.getItem("graip_backend"), "Scramjet");
});

test("a data: URL is not a cloak icon", () => {
  const { api } = load();
  assert.equal(api.sanitize(api.SCHEMA.find((s) => s.key === "graip_cloakIcon"), "data:text/html,<script>").ok, false);
  assert.equal(api.sanitize(api.SCHEMA.find((s) => s.key === "graip_cloakIcon"), "//evil.example/x.png").ok, false);
  assert.equal(api.sanitize(api.SCHEMA.find((s) => s.key === "graip_cloakIcon"), "/assets/img/cloaks/gmail.png").ok, true);
  assert.equal(api.sanitize(api.SCHEMA.find((s) => s.key === "graip_cloakIcon"), "https://www.google.com/favicon.ico").ok, true);
});

test("wisp URLs must be websocket URLs", () => {
  const entry = { key: "graip_wispUrlCustom", type: "wisp" };
  const { api } = load();

  for (const good of ["wss://wisp.example/", "ws://localhost:8080/wisp"]) {
    const clean = api.sanitize(entry, good);
    assert.equal(clean.ok, true, good);
    assert.match(clean.value, /^wss?:\/\//);
  }
  for (const bad of ["https://wisp.example/", "wisp.example", "javascript:wss://x", "wss://", ""]) {
    assert.equal(api.sanitize(entry, bad).ok, false, bad);
  }
});

test("toggles accept the spellings the site has used and write its own", () => {
  const { api } = load();
  const particles = api.SCHEMA.find((s) => s.key === "graip_particlesOn");
  const verbose = api.SCHEMA.find((s) => s.key === "graip_verboseLogs");

  for (const truthy of ["yes", "on", "true", "1", "YES", true]) {
    assert.equal(api.sanitize(particles, truthy).value, "yes", String(truthy));
    // verbose logging uses on/off, not yes/no
    assert.equal(api.sanitize(verbose, truthy).value, "on", String(truthy));
  }
  for (const falsy of ["no", "off", "false", "0", false]) {
    assert.equal(api.sanitize(particles, falsy).value, "no", String(falsy));
    assert.equal(api.sanitize(verbose, falsy).value, "off", String(falsy));
  }
  assert.equal(api.sanitize(particles, "maybe").ok, false);
});

test("unchanged values are counted but not rewritten", () => {
  const { api, localStorage } = load({ seed: { graip_theme: "void" } });
  const report = api.apply(JSON.stringify({ settings: { graip_theme: "void" } }));

  assert.equal(report.ok, true);
  sameList(report.applied, []);
  sameList(report.unchanged, ["graip_theme"]);
  assert.equal(localStorage.writes.length, 0);
});

test("optional settings accept null as leave-me-alone", () => {
  const { api } = load();
  const report = api.apply(
    JSON.stringify({ settings: { graip_cloakTitle: null, graip_panicTargetUrl: "" } })
  );
  assert.equal(report.ok, true);
  assert.equal(report.skipped.length, 0);
  sameList(report.unchanged, ["graip_cloakTitle", "graip_panicTargetUrl"]);
});

test("importing a wisp choice clears the old probe state", () => {
  const { api, localStorage } = load({
    seed: {
      graip_wispUrl: "wss://zombie.example/",
      graip_wispUrlFallback: "wss://zombie.example/",
      graip_wispUrlVerifiedAt: "1700000000000",
    },
  });
  const report = api.apply(JSON.stringify({ settings: { graip_wispUrlSelected: "Anura" } }));

  assert.equal(report.ok, true);
  sameList(report.applied, ["graip_wispUrlSelected"]);
  assert.equal(localStorage.getItem("graip_wispUrl"), null);
  assert.equal(localStorage.getItem("graip_wispUrlFallback"), null);
  assert.equal(localStorage.getItem("graip_wispUrlVerifiedAt"), null);
  assert.ok(report.sideEffects.length >= 2);

  // ...but a theme-only import leaves the endpoint alone
  const other = load({ seed: { graip_wispUrl: "wss://keep.example/" } });
  other.api.apply(JSON.stringify({ settings: { graip_theme: "mint" } }));
  assert.equal(other.localStorage.getItem("graip_wispUrl"), "wss://keep.example/");
});

test("describe() summarises a report for a toast", () => {
  const { api } = load();
  const report = api.apply(
    JSON.stringify({ settings: { graip_theme: "mint", graip_theme_typo: "x", graip_panicKey: "  " } })
  );
  const text = api.describe(report);
  assert.match(text, /1 setting restored/);
  assert.match(text, /2 entries skipped/);
  assert.equal(api.describe({ ok: false, error: "nope" }), "nope");
});

test("preview lists changes without writing", () => {
  const { api, localStorage } = load({ seed: { graip_theme: "void" } });
  const result = api.preview(
    JSON.stringify({ settings: { graip_theme: "mint", graip_theme_again: "x", graip_searchEngine: "Qwant" } })
  );

  assert.equal(result.ok, true);
  const byKey = {};
  for (const row of result.rows) byKey[row.key] = row;

  assert.equal(byKey.graip_theme.status, "change");
  assert.equal(byKey.graip_theme.from, "void");
  assert.equal(byKey.graip_theme.to, "mint");
  assert.equal(byKey.graip_searchEngine.status, "change");
  assert.equal(byKey.graip_theme_again.status, "unknown");
  assert.equal(localStorage.writes.length, 0);
});

test("reset removes known settings but keeps the log and tabs", () => {
  const { api, localStorage } = load({
    seed: {
      graip_theme: "void",
      graip_debugLog: "[{\"m\":1}]",
      "graip_tabs:/": "[]",
      graip_libraryIssues: "{}",
      unrelated: "keep",
    },
  });

  const cleared = api.reset();
  assert.ok(cleared.includes("graip_theme"));
  assert.equal(localStorage.getItem("graip_theme"), null);
  assert.equal(localStorage.getItem("graip_debugLog"), "[{\"m\":1}]");
  assert.equal(localStorage.getItem("graip_tabs:/"), "[]");
  assert.equal(localStorage.getItem("unrelated"), "keep");
});

test("reduced motion is a backed-up appearance setting", () => {
  const { api } = load();
  const setting = api.SCHEMA.find((entry) => entry.key === "graip_reduceMotion");
  assert.deepEqual({ group: setting.group, label: setting.label, type: setting.type }, {
    group: "appearance", label: "Reduce motion", type: "bool",
  });
  const imported = api.import({ graip_reduceMotion: "yes" });
  assert.equal(imported.ok, true);
  assert.equal(api.get("graip_reduceMotion"), "yes");
  const backup = JSON.parse(api.exportJSON());
  assert.equal(backup.settings.graip_reduceMotion, "yes");
});

test("every schema key is unique and covers the documented groups", () => {
  const { api } = load();
  const keys = api.SCHEMA.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);

  const groups = new Set(api.SCHEMA.map((entry) => entry.group));
  for (const group of ["appearance", "proxy", "cloaking", "gaming", "logging"]) {
    assert.ok(groups.has(group), `missing group ${group}`);
  }
  for (const entry of api.SCHEMA) {
    assert.ok(entry.label, `${entry.key} has no label`);
    assert.ok(api.types.includes(entry.type), `${entry.key} has an unknown type`);
  }
});

test("importFile reads a File-like object", async () => {
  const { api } = load();
  const report = await api.importFile({
    size: 20,
    text: () => Promise.resolve('{"graip_theme":"ember"}'),
  });
  assert.equal(report.ok, true);
  sameList(report.applied, ["graip_theme"]);
  assert.equal(api.get("graip_theme"), "ember");
});

test("importFile rejects oversized and missing files", async () => {
  const { api } = load();
  const huge = await api.importFile({ size: 10 * 1024 * 1024, text: () => Promise.resolve("{}") });
  assert.equal(huge.ok, false);
  assert.match(huge.error, /too large/);

  const none = await api.importFile(null);
  assert.equal(none.ok, false);
});

test("every import path is logged", () => {
  const { api, entries } = load();
  api.apply('{"graip_theme":"mint"}');
  api.apply("not json");

  const messages = entries.map((entry) => entry[2]);
  assert.ok(messages.some((message) => /settings imported/.test(message)), messages.join("\n"));
  assert.ok(messages.some((message) => /settings import rejected/.test(message)));

  const imported = entries.find((entry) => /settings imported/.test(entry[2]));
  assert.equal(imported[0], "info");
  assert.equal(imported[1], "settings");
  sameList(imported[3].applied, ["graip_theme"]);
});

test("a missing logger or a broken storage never throws", () => {
  // no GraipLog at all
  const noLogger = load({ inject: { GraipLog: undefined } });
  assert.equal(noLogger.api.apply('{"graip_theme":"mint"}').ok, true);

  // storage that throws on every call
  const hostile = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const { api } = load({ inject: { localStorage: hostile } });
  const report = api.apply('{"graip_theme":"mint"}');
  assert.equal(report.ok, true);
  assert.equal(report.applied.length, 0);
  assert.equal(report.skipped.length, 1);
  assert.match(report.skipped[0].reason, /could not be saved/);
  sameList(Object.keys(api.collect()), []);
  assert.doesNotThrow(() => api.reset());
  assert.doesNotThrow(() => api.exportJSON());
});

test("download names the file and revokes the blob URL", () => {
  const created = [];
  const revoked = [];
  const appended = [];

  const doc = {
    body: { appendChild: (node) => appended.push(node) },
    getElementById: () => null,
    createElement: () => ({
      click() {
        this.clicked = true;
      },
      remove() {},
    }),
    addEventListener() {},
    readyState: "complete",
  };

  const { api } = load({
    seed: { graip_theme: "void" },
    inject: {
      document: doc,
      Blob: function Blob(parts, options) {
        this.parts = parts;
        this.type = options && options.type;
      },
      URL: {
        createObjectURL(blob) {
          created.push(blob);
          return "blob:fake";
        },
        revokeObjectURL(url) {
          revoked.push(url);
        },
      },
    },
  });

  const name = api.download();
  assert.match(name, /^graip-settings-.*\.json$/);
  assert.equal(created.length, 1);
  assert.match(created[0].parts[0], /"format": "graip-settings"/);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].download, name);
  assert.equal(appended[0].href, "blob:fake");
});

test("the import reload is not blocked by the confirm-leave guard", () => {
  const markup = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  // both beforeunload handlers (the upstream file has the block twice) must let
  // the importer's reload through
  const guarded = markup.match(/graip_skipLeaveGuard/g) || [];
  assert.ok(guarded.length >= 3, "index.html should check the skip flag and clear it");

  const handlers = markup.match(/window\.addEventListener\("beforeunload", function \(e\) \{[\s\S]{0,400}?\n        \}\)/g) || [];
  assert.equal(handlers.length, 2, "expected the two beforeunload handlers");
  for (const handler of handlers) {
    assert.match(handler, /sessionStorage\.getItem\("graip_skipLeaveGuard"\) !== "1"/);
  }

  const source = fs.readFileSync(SOURCE, "utf8");
  assert.match(source, /sessionStorage\.setItem\("graip_skipLeaveGuard", "1"\)/);
});

test("the Backup panel is wired into the settings sidebar", () => {
  const markup = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(markup, /data-target="backup"/);
  assert.match(markup, /id="settings-backup"/);
  assert.match(markup, /<script src="\/assets\/js\/settings-io\.js" defer><\/script>/);

  for (const id of [
    "settings-import-file",
    "settings-import-pick",
    "settings-import-text",
    "settings-import-paste",
    "settings-import-status",
    "settings-summary",
  ]) {
    assert.ok(markup.includes(`id="${id}"`), `missing #${id}`);
  }
});

test("the panel summary lists every setting with its current value", () => {
  const { api } = load({ seed: { graip_theme: "void" } });
  const text = api.summary();
  const lines = text.split("\n");

  assert.equal(lines.length, api.SCHEMA.length);
  assert.ok(text.includes("graip_theme") === false, "summary uses labels, not raw keys");
  assert.match(text, /void/);
  assert.match(text, /\(default\)/);
});
