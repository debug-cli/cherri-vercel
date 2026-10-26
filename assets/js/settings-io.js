/**
 * Settings export / import.
 *
 * One job: move every user preference off this device and back again, without a
 * backend and without ever writing something the site would not have accepted
 * from its own UI.
 *
 * Design constraints:
 * - the schema is an allowlist. Only keys listed here are exported, and only
 *   listed keys can be written on import, so a shared config file can never
 *   touch the log buffer, tab history, or an arbitrary localStorage key;
 * - every value is re-validated on import. Config files travel between people,
 *   so `graip_cloakIcon: "javascript:..."` has to be rejected rather than
 *   assigned to a <link href>;
 * - a partial file is a valid file: keys that are absent are left alone, which
 *   makes a five-line JSON snippet a usable "patch";
 * - nothing here may throw. Import runs on a page that is about to reload.
 *
 * The log (assets/js/log.js) is deliberately *not* a setting: it has its own
 * export, and importing someone else's log would pollute their crash reports.
 */
(function (global) {
  "use strict";

  const FORMAT = "graip-settings";
  const VERSION = 1;
  /** Enough for a full config with room to spare; anything bigger is not ours. */
  const MAX_BYTES = 64 * 1024;

  /**
   * Runtime state that lives in localStorage next to the settings but must not
   * travel: the active Wisp endpoint is whatever answered last, and the log is
   * per-device diagnostic data.
   */
  const IGNORED = {
    graip_wispUrl: "active Wisp endpoint (runtime state)",
    graip_wispUrlFallback: "automatic fallback (runtime state)",
    graip_wispUrlVerifiedAt: "handshake timestamp (runtime state)",
    graip_debugLog: "debug log buffer (use Debug → Export)",
    graip_debugMaxEntries: "log buffer size (per device)",
    graip_libraryIssues: "library health report (per device)",
    graip_siteVersion: "site version stamp",
  };

  /** Importing a Wisp preference invalidates the probe cache. */
  const WISP_KEYS = ["graip_wispUrlSelected", "graip_wispUrlCustom"];
  const WISP_STATE_KEYS = ["graip_wispUrl", "graip_wispUrlFallback", "graip_wispUrlVerifiedAt"];

  const TYPES = ["bool", "token", "label", "text", "url", "wisp", "key", "enum"];

  /**
   * Every setting the site owns, grouped the way the Settings sidebar is.
   *
   * `type` decides validation, `trueValue`/`falseValue` decide what a toggle is
   * written as (the site has two conventions: yes/no and on/off), and `options`
   * pins an enum to the values the UI offers.
   */
  const SCHEMA = [
    // ------------------------------------------------------------- appearance
    { key: "graip_theme", group: "appearance", label: "Theme", type: "token" },
    { key: "graip_particlesOn", group: "appearance", label: "Fog", type: "bool" },
    { key: "graip_customCursor", group: "appearance", label: "Custom cursor", type: "bool" },

    // ------------------------------------------------------------------ proxy
    { key: "graip_wispUrlSelected", group: "proxy", label: "Wisp route", type: "label" },
    { key: "graip_wispUrlCustom", group: "proxy", label: "Custom Wisp URL", type: "wisp", optional: true },
    { key: "graip_backend", group: "proxy", label: "Backend", type: "token" },
    { key: "graip_searchEngine", group: "proxy", label: "Search engine", type: "token" },

    // --------------------------------------------------------------- cloaking
    { key: "decoy", group: "cloaking", label: "Tab cloak", type: "label" },
    { key: "graip_cloakTitle", group: "cloaking", label: "Cloak title", type: "text", optional: true },
    { key: "graip_cloakIcon", group: "cloaking", label: "Cloak icon", type: "url", optional: true },
    { key: "graip_cloakProfile", group: "cloaking", label: "Cloak profile", type: "label" },
    { key: "graip_panicEnabled", group: "cloaking", label: "Panic key on", type: "bool" },
    { key: "graip_panicKey", group: "cloaking", label: "Panic key", type: "key" },
    { key: "graip_panicTarget", group: "cloaking", label: "Panic destination", type: "label" },
    { key: "graip_panicTargetUrl", group: "cloaking", label: "Panic custom URL", type: "url", optional: true },
    { key: "graip_panicOpenIn", group: "cloaking", label: "Panic behaviour", type: "enum", options: ["same-tab", "new-tab"] },
    { key: "graip_panicShowDecoy", group: "cloaking", label: "Panic decoy", type: "bool" },
    { key: "graip_autoAB", group: "cloaking", label: "Auto about:blank", type: "bool" },

    // ----------------------------------------------------------------- gaming
    { key: "graip_gameStore", group: "gaming", label: "Game library", type: "token" },
    { key: "graip_useOverlay", group: "gaming", label: "Game overlay", type: "bool" },
    { key: "graip_confirmLeave", group: "gaming", label: "Confirm before leaving", type: "bool" },

    // ---------------------------------------------------------------- logging
    { key: "graip_verboseLogs", group: "logging", label: "Verbose logging", type: "bool", trueValue: "on", falseValue: "off" },
  ];

  const BY_KEY = {};
  for (const entry of SCHEMA) BY_KEY[entry.key] = entry;

  /** true/false spellings the site has used, mapped to the toggle value. */
  const TRUTHY = ["yes", "on", "true", "1", "y"];
  const FALSY = ["no", "off", "false", "0", "n"];

  function log(level, message, data) {
    try {
      if (global.GraipLog && typeof global.GraipLog[level] === "function") {
        global.GraipLog[level]("settings", message, data);
      }
    } catch (error) {
      /* a logger failure must never break an import */
    }
  }

  function storage() {
    try {
      return global.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function read(key) {
    const store = storage();
    if (!store) return null;
    try {
      return store.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function write(key, value) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(key, value);
      return true;
    } catch (error) {
      log("warn", "could not save a setting", { key, error: (error && error.message) || String(error) });
      return false;
    }
  }

  function remove(key) {
    const store = storage();
    if (!store) return false;
    try {
      store.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function has(entry, value) {
    return value !== null && value !== undefined && !(entry.optional && value === "");
  }

  // ------------------------------------------------------------- validation

  function safeUrl(value) {
    const text = String(value).trim();
    if (!text || text.length > 300) return null;
    if (/[\u0000-\u001f\u007f]/.test(text)) return null;

    // Site-relative asset (cloak icons live in /assets/img/cloaks/). Reject
    // protocol-relative "//evil.example" by requiring a single leading slash.
    if (text.startsWith("/")) {
      if (text.startsWith("//")) return null;
      return /^\/[A-Za-z0-9._~\-/%]+$/.test(text) ? text : null;
    }

    if (/^(https?):\/\//i.test(text)) {
      try {
        const url = new URL(text);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.href;
      } catch (error) {
        return null;
      }
    }

    // about:blank is a legitimate panic destination; nothing else is.
    return text === "about:blank" ? text : null;
  }

  function safeWisp(value) {
    const text = String(value).trim();
    if (!text || text.length > 200) return null;
    if (!/^wss?:\/\//i.test(text)) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
      if (!url.host) return null;
      return url.href;
    } catch (error) {
      return null;
    }
  }

  /**
   * @returns {{ok: boolean, value?: string, reason?: string}}
   */
  function sanitize(entry, raw) {
    if (!entry) return { ok: false, reason: "unknown setting" };

    if (entry.type === "bool") {
      const text = String(raw).trim().toLowerCase();
      if (TRUTHY.indexOf(text) !== -1) return { ok: true, value: entry.trueValue || "yes" };
      if (FALSY.indexOf(text) !== -1) return { ok: true, value: entry.falseValue || "no" };
      if (typeof raw === "boolean") return { ok: true, value: raw ? entry.trueValue || "yes" : entry.falseValue || "no" };
      return { ok: false, reason: "expected true or false" };
    }

    const text = typeof raw === "string" ? raw : String(raw);
    if (text.length > 300) return { ok: false, reason: "value is too long" };
    if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, reason: "value contains control characters" };

    switch (entry.type) {
      case "token":
        // Theme names, backend names, store ids: no slashes, no traversal.
        return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,47}$/.test(text)
          ? { ok: true, value: text }
          : { ok: false, reason: "expected a short name" };

      case "label":
        // Dropdown labels such as "Blank (about:blank)" or "Khan Academy".
        return /^[A-Za-z0-9][A-Za-z0-9 ._()\u2019'-]{0,47}$/.test(text)
          ? { ok: true, value: text }
          : { ok: false, reason: "expected a dropdown label" };

      case "text":
        return text.length <= 120 && !/[<>]/.test(text)
          ? { ok: true, value: text }
          : { ok: false, reason: "expected at most 120 characters without < or >" };

      case "url": {
        const url = safeUrl(text);
        return url ? { ok: true, value: url } : { ok: false, reason: "expected an http(s) URL or a /path" };
      }

      case "wisp": {
        const url = safeWisp(text);
        return url ? { ok: true, value: url } : { ok: false, reason: "expected a ws:// or wss:// URL" };
      }

      case "key":
        // A KeyboardEvent.key value: one printable character, or a named key
        // such as Escape, or Shift+Z. Whitespace would be unreachable.
        return /^(?:Shift\+)?[A-Za-z0-9`~!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{1,7}$|^(?:Escape|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Insert|F[1-9]|F1[0-2])$/.test(
          text
        )
          ? { ok: true, value: text }
          : { ok: false, reason: "expected a keyboard key" };

      case "enum": {
        const options = entry.options || [];
        const match = options.filter((option) => option.toLowerCase() === text.toLowerCase())[0];
        return match ? { ok: true, value: match } : { ok: false, reason: `expected one of: ${options.join(", ")}` };
      }

      default:
        return { ok: false, reason: `unsupported type ${entry.type}` };
    }
  }

  // ---------------------------------------------------------------- collect

  /** Current values of every exported setting, skipping keys never written. */
  function collect() {
    const out = {};
    for (const entry of SCHEMA) {
      const value = read(entry.key);
      if (!has(entry, value)) continue;
      const clean = sanitize(entry, value);
      // A value the site itself wrote but the schema rejects is not copied:
      // exporting it would produce a file that fails on import.
      if (clean.ok) out[entry.key] = clean.value;
      else log("warn", "setting skipped on export", { key: entry.key, reason: clean.reason });
    }
    return out;
  }

  function exportData() {
    let page = "";
    try {
      page = global.location ? global.location.origin + "/" : "";
    } catch (error) {
      page = "";
    }

    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      site: page,
      settings: collect(),
    };
  }

  function exportJSON(pretty) {
    try {
      return JSON.stringify(exportData(), null, pretty === false ? 0 : 2);
    } catch (error) {
      return JSON.stringify({ format: FORMAT, version: VERSION, settings: {} });
    }
  }

  // ------------------------------------------------------------------ parse

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * Accept three shapes, because people hand-edit these files:
   *   1. the full export object ({ format, version, settings })
   *   2. a bare map of settings ({ "graip_theme": "void" })
   *   3. a JSON string of either
   *
   * @returns {{ok: boolean, settings?: object, meta?: object, warnings?: string[], error?: string}}
   */
  function parse(input) {
    let data = input;

    if (typeof data === "string") {
      const text = data.trim();
      if (!text) return { ok: false, error: "That is empty." };
      if (text.length > MAX_BYTES) return { ok: false, error: "That file is too large to be a settings backup." };
      try {
        data = JSON.parse(text);
      } catch (error) {
        return { ok: false, error: "That is not valid JSON." };
      }
    }

    if (!isPlainObject(data)) return { ok: false, error: "Expected a settings object." };

    const warnings = [];
    let settings = null;
    let meta = {};

    if (isPlainObject(data.settings)) {
      settings = data.settings;
      meta = { format: data.format, version: data.version, exportedAt: data.exportedAt };
      if (data.format && data.format !== FORMAT) {
        warnings.push(`This file says it is "${data.format}", not "${FORMAT}".`);
      }
      if (data.version && data.version !== VERSION) {
        warnings.push(`Saved by version ${data.version}; this build understands version ${VERSION}.`);
      }
    } else if (data.format === FORMAT) {
      return { ok: false, error: "That file has no settings in it." };
    } else {
      // Flat map: treat the object itself as the settings.
      settings = data;
      warnings.push("Read as a bare list of settings (no backup wrapper).");
    }

    if (!Object.keys(settings).length) return { ok: false, error: "That file has no settings in it." };

    return { ok: true, settings, meta, warnings };
  }

  // ----------------------------------------------------------------- import

  /**
   * Merge a parsed (or raw) config into localStorage.
   *
   * Absent keys are untouched, so this doubles as a patch. Values are validated
   * one by one: one bad entry never blocks the rest.
   */
  function apply(input) {
    const report = {
      ok: false,
      applied: [],
      unchanged: [],
      skipped: [],
      ignored: [],
      unknown: [],
      sideEffects: [],
      warnings: [],
      meta: {},
      error: "",
    };

    const parsed = parse(input);
    if (!parsed.ok) {
      report.error = parsed.error;
      log("warn", "settings import rejected", { error: parsed.error });
      return report;
    }

    report.meta = parsed.meta || {};
    report.warnings = parsed.warnings || [];

    const before = collect();

    for (const key of Object.keys(parsed.settings)) {
      const raw = parsed.settings[key];

      if (Object.prototype.hasOwnProperty.call(IGNORED, key)) {
        report.ignored.push({ key, reason: IGNORED[key] });
        continue;
      }
      if (/^graip_tabs(:|$)/.test(key)) {
        report.ignored.push({ key, reason: "open tabs (session state)" });
        continue;
      }

      const entry = BY_KEY[key];
      if (!entry) {
        report.unknown.push(key);
        continue;
      }

      // null / "" mean "leave it alone" for optional settings such as a cloak
      // icon or a custom panic URL.
      if (raw === null || raw === undefined || (entry.optional && raw === "")) {
        if (entry.optional) {
          report.unchanged.push(key);
          continue;
        }
        report.skipped.push({ key, reason: "value is missing" });
        continue;
      }

      const clean = sanitize(entry, raw);
      if (!clean.ok) {
        report.skipped.push({ key, reason: clean.reason });
        continue;
      }

      if (before[key] === clean.value) {
        report.unchanged.push(key);
        continue;
      }

      if (!write(key, clean.value)) {
        report.skipped.push({ key, reason: "could not be saved (storage is full or blocked)" });
        continue;
      }

      report.applied.push(key);
    }

    // A new Wisp preference must not keep pointing at the endpoint that answered
    // for the *old* one, otherwise the import has no visible effect until the
    // next failover.
    if (WISP_KEYS.some((key) => report.applied.indexOf(key) !== -1)) {
      for (const key of WISP_STATE_KEYS) {
        if (remove(key)) report.sideEffects.push(`cleared ${key}`);
      }
    }

    report.ok = true;

    const summary = {
      applied: report.applied.length,
      unchanged: report.unchanged.length,
      skipped: report.skipped.length,
      ignored: report.ignored.length,
      unknown: report.unknown.length,
    };

    log(
      report.skipped.length ? "warn" : "info",
      `settings imported (${summary.applied} applied, ${summary.unchanged} unchanged, ${summary.skipped} skipped)`,
      {
        applied: report.applied,
        skipped: report.skipped.map((item) => item.key),
        unknown: report.unknown,
        ignored: report.ignored.map((item) => item.key),
        sideEffects: report.sideEffects,
      }
    );

    return report;
  }

  /** Human-readable one-liner for a toast. */
  function describe(report) {
    if (!report || !report.ok) return (report && report.error) || "Import failed.";
    const applied = report.applied.length;
    const problems = report.skipped.length + report.unknown.length;
    const head = applied
      ? `${applied} setting${applied === 1 ? "" : "s"} restored`
      : "Nothing new to restore";
    return problems
      ? `${head} · ${problems} entr${problems === 1 ? "y" : "ies"} skipped (see the log)`
      : `${head}.`;
  }

  /** Preview what a file would change without touching storage. */
  function preview(input) {
    const parsed = parse(input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const before = collect();
    const rows = [];
    for (const key of Object.keys(parsed.settings)) {
      const entry = BY_KEY[key];
      if (!entry) {
        rows.push({ key, status: "unknown" });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(IGNORED, key)) {
        rows.push({ key, status: "ignored" });
        continue;
      }
      const clean = sanitize(entry, parsed.settings[key]);
      if (!clean.ok) {
        rows.push({ key, status: "invalid", reason: clean.reason });
        continue;
      }
      rows.push({
        key,
        status: before[key] === clean.value ? "unchanged" : "change",
        from: before[key] === undefined ? null : before[key],
        to: clean.value,
      });
    }
    return { ok: true, rows, warnings: parsed.warnings || [] };
  }

  // ------------------------------------------------------------------ reset

  /** Remove every exported setting; each subsystem falls back to its own default. */
  function reset() {
    const cleared = [];
    for (const entry of SCHEMA) {
      if (read(entry.key) === null) continue;
      if (remove(entry.key)) cleared.push(entry.key);
    }
    for (const key of WISP_STATE_KEYS) {
      if (remove(key)) cleared.push(key);
    }
    log("info", `settings reset (${cleared.length} keys cleared)`, { cleared });
    return cleared;
  }

  // ---------------------------------------------------------------- transfer

  function stamp() {
    try {
      return new Date().toISOString().replace(/[:.]/g, "-");
    } catch (error) {
      return String(Date.now());
    }
  }

  /** Download the current config as a .json file. */
  function download() {
    const body = exportJSON();
    const name = `graip-settings-${stamp()}.json`;
    const doc = global.document;

    if (!doc || !global.Blob || !global.URL || !global.URL.createObjectURL) {
      log("warn", "downloads are unavailable here");
      return null;
    }

    try {
      const blob = new global.Blob([body], { type: "application/json;charset=utf-8" });
      const href = global.URL.createObjectURL(blob);
      const link = doc.createElement("a");
      link.href = href;
      link.download = name;
      link.rel = "noopener";
      doc.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => {
        try {
          global.URL.revokeObjectURL(href);
        } catch (error) {
          /* ignore */
        }
      }, 2000);
      log("info", "settings exported", { file: name, count: Object.keys(exportData().settings).length });
      return name;
    } catch (error) {
      log("error", "could not download the settings file", error);
      return null;
    }
  }

  async function copy() {
    const body = exportJSON();
    try {
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(body);
        log("info", "settings copied to clipboard");
        return true;
      }
    } catch (error) {
      log("warn", "clipboard write failed", error);
    }
    return false;
  }

  /** Read a File/Blob from an <input type="file"> and import it. */
  function importFile(file) {
    return new Promise((resolve) => {
      const fail = (error) => {
        log("warn", "settings file could not be read", { error: (error && error.message) || String(error) });
        resolve({ ok: false, error: "Could not read that file." });
      };

      if (!file) {
        resolve({ ok: false, error: "No file chosen." });
        return;
      }
      if (file.size && file.size > MAX_BYTES) {
        resolve({ ok: false, error: "That file is too large to be a settings backup." });
        return;
      }

      try {
        if (typeof file.text === "function") {
          file
            .text()
            .then((text) => resolve(apply(text)))
            .catch(fail);
          return;
        }
        if (global.FileReader) {
          const reader = new global.FileReader();
          reader.onload = () => resolve(apply(String(reader.result)));
          reader.onerror = () => fail(reader.error);
          reader.readAsText(file);
          return;
        }
      } catch (error) {
        fail(error);
        return;
      }

      fail(new Error("no reader available"));
    });
  }

  // --------------------------------------------------------------------- ui

  function toast(kind, message) {
    try {
      if (typeof global.showToast === "function") {
        global.showToast(kind, message, kind === "error" ? "fas fa-triangle-exclamation" : "fas fa-check-circle");
      }
    } catch (error) {
      /* ignore */
    }
  }

  /** Current config, one line per setting, for the panel preview. */
  function summary() {
    const values = collect();
    return SCHEMA.map((entry) => {
      const value = values[entry.key];
      return `${entry.group.padEnd(10)} ${entry.label.padEnd(22)} ${value === undefined ? "(default)" : value}`;
    }).join("\n");
  }

  /**
   * Reload so every subsystem re-reads the new values. The beforeunload guard in
   * index.html is skipped for this one navigation, otherwise importing
   * "confirm before leaving" would block the reload that makes it visible.
   */
  function reloadNow() {
    try {
      if (global.sessionStorage) global.sessionStorage.setItem("graip_skipLeaveGuard", "1");
    } catch (error) {
      /* ignore */
    }
    try {
      global.location.reload();
    } catch (error) {
      log("warn", "could not reload after import");
    }
  }

  function renderSummary() {
    const doc = global.document;
    if (!doc) return;
    const box = doc.getElementById("settings-summary");
    if (!box) return;
    try {
      box.textContent = summary();
    } catch (error) {
      box.textContent = "(could not read settings)";
    }
  }

  /** Report an import result in the panel and in the log-backed toast. */
  function reportToUi(report) {
    const doc = global.document;
    const target = doc && doc.getElementById("settings-import-status");
    if (target) {
      if (!report.ok) {
        target.textContent = report.error || "Import failed.";
      } else {
        const lines = [describe(report)];
        for (const item of report.skipped) lines.push(`skipped ${item.key}: ${item.reason}`);
        for (const key of report.unknown) lines.push(`unknown ${key}`);
        for (const warning of report.warnings) lines.push(warning);
        target.textContent = lines.join("\n");
      }
    }
    renderSummary();
    if (report.ok) toast(report.skipped.length ? "warning" : "success", describe(report));
    else toast("error", report.error || "Import failed.");
  }

  function finishImport(report) {
    reportToUi(report);
    if (!report.ok) return report;
    // Give the toast a beat to render before the page goes away.
    setTimeout(reloadNow, report.applied.length || report.sideEffects.length ? 900 : 0);
    return report;
  }

  function bind() {
    const doc = global.document;
    if (!doc) return;

    const file = doc.getElementById("settings-import-file");
    const pick = doc.getElementById("settings-import-pick");
    const paste = doc.getElementById("settings-import-paste");
    const box = doc.getElementById("settings-import-text");

    if (pick && file) {
      pick.addEventListener("click", () => file.click());
      file.addEventListener("change", () => {
        const chosen = file.files && file.files[0];
        if (!chosen) return;
        importFile(chosen).then(finishImport);
        file.value = "";
      });
    }

    if (paste && box) {
      paste.addEventListener("click", () => {
        if (!box.value.trim()) {
          toast("error", "Paste a settings file first.");
          return;
        }
        finishImport(apply(box.value));
      });
    }

    renderSummary();
    log("debug", "settings backup panel ready");
  }

  const api = {
    FORMAT,
    VERSION,
    SCHEMA,
    IGNORED,
    MAX_BYTES,
    types: TYPES,
    sanitize,
    collect,
    exportData,
    exportJSON,
    parse,
    preview,
    apply,
    import: apply,
    describe,
    reset,
    download,
    copy,
    importFile,
    summary,
    renderSummary,
    reportToUi,
    reloadNow,
    bind,
    /** Read the raw value of a known setting (used by tests and the panel). */
    get(key) {
      const entry = BY_KEY[key];
      return entry ? read(key) : null;
    },
  };

  global.GraipSettings = api;

  // ----------------------------------------------------- inline button glue

  /** Copy the config; the toast confirms, the clipboard is the deliverable. */
  global.GraipSettingsUiCopy = function () {
    api.copy().then((ok) => {
      toast(ok ? "success" : "error", ok ? "Settings JSON copied." : "Could not copy — use Save settings file.");
    });
  };

  /** Destructive, so it asks first; then reload so the reset is visible. */
  global.GraipSettingsUiReset = function () {
    const message = "Reset every saved setting to the shipped defaults?";
    let agreed = true;
    try {
      if (typeof global.confirm === "function") agreed = global.confirm(message);
    } catch (error) {
      agreed = true;
    }
    if (!agreed) {
      log("info", "settings reset cancelled");
      return;
    }

    const cleared = api.reset();
    const doc = global.document;
    const target = doc && doc.getElementById("settings-import-status");
    if (target) {
      target.textContent = cleared.length
        ? `Reset ${cleared.length} setting${cleared.length === 1 ? "" : "s"} to their defaults. Reloading…`
        : "Already at the shipped defaults.";
    }
    renderSummary();
    toast("success", cleared.length ? "Settings reset. Reloading…" : "Already at defaults.");
    if (cleared.length) setTimeout(reloadNow, 900);
  };

  // ------------------------------------------------------------- bootstrap

  try {
    const doc = global.document;
    if (doc) {
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
      else bind();
    }
  } catch (error) {
    log("warn", "settings backup panel did not start", error);
  }
})(typeof window !== "undefined" ? window : globalThis);
