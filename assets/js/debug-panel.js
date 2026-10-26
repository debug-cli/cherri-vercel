/**
 * Settings wiring for the Debug panel and the panic/cloak controls.
 *
 * The page markup only declares empty slots (`.graip-toggle-slot`); the switches
 * themselves are cloned from an existing toggle so the new controls are pixel
 * identical to the ones that were already there, and adding one costs no markup.
 *
 * Every value is written through GraipCloak / GraipLog, which own the storage
 * keys, so nothing here duplicates default logic.
 */
(function (global) {
  "use strict";

  const doc = global.document;

  function log(level, message, data) {
    if (global.GraipLog) global.GraipLog[level]("settings", message, data);
  }

  /**
   * @param {object} options
   * @param {string} options.id input id
   * @param {boolean} options.checked
   * @param {(checked: boolean) => void} options.onChange
   * @returns {HTMLElement|null}
   */
  function makeSwitch(options) {
    const source = doc.querySelector(".switch");
    if (!source) return null;

    const label = source.cloneNode(true);
    const input = label.querySelector("input");
    if (!input) return null;

    input.id = options.id;
    input.checked = Boolean(options.checked);
    input.removeAttribute("onchange");
    input.onchange = null;
    input.setAttribute("aria-label", options.label || options.id);
    input.addEventListener("change", () => options.onChange(input.checked));

    return label;
  }

  /** Mount a toggle into every `[data-slot="<name>"]` placeholder. */
  function mountToggle(name, options) {
    const slots = Array.from(doc.querySelectorAll(`.graip-toggle-slot[data-slot="${name}"]`));
    if (!slots.length) return null;

    let mounted = null;
    for (const slot of slots) {
      if (slot.querySelector("input")) continue;
      const toggle = makeSwitch(options);
      if (!toggle) continue;
      slot.appendChild(toggle);
      mounted = toggle;
    }
    return mounted;
  }

  // ---------------------------------------------------------------- panic key

  function renderPanicSettings() {
    const cloak = global.GraipCloak;
    if (!cloak) return;

    const config = cloak.settings();

    const keySelect = doc.getElementById("panic-key");
    if (keySelect && !keySelect.options.length) {
      for (const label of Object.keys(cloak.PANIC_KEYS)) {
        const option = doc.createElement("option");
        option.value = cloak.PANIC_KEYS[label];
        option.textContent = label;
        keySelect.appendChild(option);
      }
    }
    if (keySelect) keySelect.value = config.key;

    const targetSelect = doc.getElementById("panic-target");
    if (targetSelect && !targetSelect.options.length) {
      for (const label of Object.keys(cloak.TARGETS)) {
        const option = doc.createElement("option");
        option.value = label;
        option.textContent = label;
        targetSelect.appendChild(option);
      }
    }
    if (targetSelect) targetSelect.value = config.target;

    const custom = doc.getElementById("panic-custom-url");
    if (custom) {
      custom.value = config.customUrl || "";
      custom.style.display = config.target === "Custom URL…" ? "block" : "none";
    }

    const openSelect = doc.getElementById("panic-open");
    if (openSelect) openSelect.value = config.openIn;

    const settingsBox = doc.getElementById("panic-settings");
    if (settingsBox) settingsBox.style.opacity = config.enabled ? "1" : "0.5";
  }

  function bindPanicControls() {
    const cloak = global.GraipCloak;
    if (!cloak) return;

    mountToggle("panic", {
      id: "panic-toggle",
      label: "Enable the panic key",
      checked: cloak.settings().enabled,
      onChange: (checked) => {
        localStorage.setItem(cloak.KEYS.enabled, checked ? "yes" : "no");
        log("info", `panic key ${checked ? "enabled" : "disabled"}`, { key: cloak.settings().key });
        renderPanicSettings();
      },
    });

    mountToggle("panic-decoy", {
      id: "panic-decoy-toggle",
      label: "Show a decoy page while the panic site loads",
      checked: cloak.settings().showDecoy,
      onChange: (checked) => {
        localStorage.setItem(cloak.KEYS.showDecoy, checked ? "yes" : "no");
        log("info", `panic decoy page ${checked ? "enabled" : "disabled"}`);
      },
    });

    const keySelect = doc.getElementById("panic-key");
    if (keySelect) {
      keySelect.addEventListener("change", () => {
        localStorage.setItem(cloak.KEYS.key, keySelect.value);
        log("info", "panic key changed", { key: keySelect.value });
      });
    }

    const targetSelect = doc.getElementById("panic-target");
    if (targetSelect) {
      targetSelect.addEventListener("change", () => {
        localStorage.setItem(cloak.KEYS.target, targetSelect.value);
        log("info", "panic destination changed", { target: targetSelect.value });
        renderPanicSettings();
      });
    }

    const customInput = doc.getElementById("panic-custom-url");
    if (customInput) {
      customInput.addEventListener("change", () => {
        localStorage.setItem(cloak.KEYS.targetUrl, customInput.value.trim());
        log("info", "custom panic URL saved");
      });
    }

    const openSelect = doc.getElementById("panic-open");
    if (openSelect) {
      openSelect.addEventListener("change", () => {
        localStorage.setItem(cloak.KEYS.openIn, openSelect.value);
        log("info", "panic behaviour changed", { openIn: openSelect.value });
      });
    }

    renderPanicSettings();
  }

  // ------------------------------------------------------------------- debug

  function debugPreviewText() {
    if (!global.GraipLog) return "The debug log did not load on this page.";
    const entries = global.GraipLog.recent(40);
    if (!entries.length) return "No entries yet.";

    return entries
      .map((entry) => {
        const time = entry.at.slice(11, 19);
        const data = entry.data === undefined ? "" : " " + JSON.stringify(entry.data);
        return `${time} [${entry.level}] ${entry.category}: ${entry.message}${data}`;
      })
      .join("\n");
  }

  function libraryIssues() {
    try {
      const raw = localStorage.getItem("graip_libraryIssues");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function renderDebugPanel() {
    const status = doc.getElementById("debug-status");
    if (status && global.GraipLog) {
      const count = global.GraipLog.entries().length;
      status.textContent = `${count} entr${count === 1 ? "y" : "ies"} recorded · verbose ${
        global.GraipLog.isVerbose() ? "on" : "off"
      }`;
    }

    const preview = doc.getElementById("debug-preview");
    if (preview && preview.dataset.pinned !== "1") preview.textContent = debugPreviewText();

    const health = doc.getElementById("library-health");
    if (health) {
      const issues = libraryIssues();
      if (!issues.length) {
        health.textContent = "Nothing reported. Reload the Games or Apps menu to check.";
      } else {
        health.textContent = issues
          .slice(-40)
          .map((issue) => `${issue.kind || "asset"} · ${issue.name || "unknown"} · ${issue.url || ""}`)
          .join("\n");
      }
    }
  }

  function bindDebugControls() {
    if (!global.GraipLog) return;

    mountToggle("verbose", {
      id: "verbose-toggle",
      label: "Verbose logging",
      checked: global.GraipLog.isVerbose(),
      onChange: (checked) => {
        global.GraipLog.setVerbose(checked);
        renderDebugPanel();
        if (typeof showToast === "function") {
          showToast("success", `Verbose logging ${checked ? "on" : "off"}.`, "fas fa-check-circle");
        }
      },
    });

    // keep the panel live while it is open, without re-rendering the whole app
    let scheduled = null;
    global.GraipLog.subscribe(() => {
      const panel = doc.getElementById("settings-debug");
      if (!panel || !panel.classList.contains("settings-active")) return;
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        renderDebugPanel();
      }, 250);
    });

    renderDebugPanel();

    // other panels write state too; refresh when Debug becomes visible
    doc.querySelectorAll('.settings-section[data-target="debug"]').forEach((button) => {
      button.addEventListener("click", () => setTimeout(renderDebugPanel, 50));
    });

  }

  global.GraipLogClear = () => {
    if (global.GraipLog) global.GraipLog.clear();
    renderDebugPanel();
    if (typeof showToast === "function") showToast("success", "Debug log cleared.", "fas fa-check-circle");
  };

  // --------------------------------------------------------------- cloak glue

  function applySavedCloak() {
    const cloak = global.GraipCloak;
    if (!cloak) return;

    // The profile dropdown in assets/js/dropdown.js owns the selection and calls
    // back into GraipCloak; this only makes sure the disguise exists on first
    // paint (before the dropdown script has run).
    cloak.applyCloak(cloak.profileName());
    cloak.installPanicKey();
  }

  // ------------------------------------------------------------------ global

  global.GraipPanicTest = () => {
    if (!global.GraipCloak) return;
    log("info", "panic test requested from settings");
    global.GraipCloak.panic({ reason: "settings-test" });
  };

  global.GraipClearTraces = () => {
    if (typeof global.clearBrowserTraces === "function") global.clearBrowserTraces();
    else if (typeof clearTabSession === "function") clearTabSession();

    try {
      sessionStorage.removeItem("graip_abOpened");
      sessionStorage.removeItem("graip_panicReturn");
    } catch (error) {
      /* ignore */
    }

    log("info", "session traces cleared from settings");
    if (typeof showToast === "function") showToast("success", "Session traces cleared.", "fas fa-check-circle");
  };

  /**
   * Validate the bundled game/app lists: shape, duplicates and thumbnails that do
   * not load. Runtime problems are already collected by index.html while it
   * renders; this is the on-demand version, so a broken entry can be found
   * without clicking through 700 tiles.
   *
   * @param {HTMLElement} [button]
   */
  async function checkLibrary(button) {
    const out = doc.getElementById("library-health");
    if (!out) return;

    const files = ["apps", "classplay", "gn-math"];
    const lines = [];
    let checked = 0;

    if (button) {
      button.disabled = true;
      button.textContent = "Checking…";
    }
    out.textContent = "Checking the bundled lists…";

    try {
      for (const file of files) {
        let items;
        try {
          const response = await fetch(`/assets/json/${file}.json`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          items = await response.json();
        } catch (error) {
          lines.push(`${file}.json: could not be loaded (${(error && error.message) || error})`);
          continue;
        }

        if (!Array.isArray(items)) {
          lines.push(`${file}.json: expected an array, got ${typeof items}`);
          continue;
        }

        const seen = new Set();
        const problems = [];
        for (const item of items) {
          checked++;
          if (!item || !item.name || !item.url) {
            problems.push(`entry without name/url: ${JSON.stringify(item).slice(0, 80)}`);
            continue;
          }
          const key = `${item.name}|${item.url}`;
          if (seen.has(key)) problems.push(`duplicate: ${item.name}`);
          seen.add(key);
        }

        lines.push(
          `${file}.json: ${items.length} entries, ${problems.length} problem${problems.length === 1 ? "" : "s"}`
        );
        for (const problem of problems.slice(0, 10)) lines.push(`  · ${problem}`);
        if (problems.length > 10) lines.push(`  · …and ${problems.length - 10} more`);
      }

      lines.push("");
      lines.push(`Checked ${checked} entries. Thumbnail failures appear above after the menus have rendered.`);
      if (global.GraipLog) global.GraipLog.info("library", "library check finished", { checked });
    } catch (error) {
      lines.push(`Check failed: ${(error && error.message) || error}`);
      if (global.GraipLog) global.GraipLog.error("library", "library check failed", error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Check library now";
      }
    }

    const reported = libraryIssues();
    if (reported.length) {
      lines.push("");
      lines.push(`Runtime thumbnail failures: ${reported.length}`);
      for (const issue of reported.slice(-10)) lines.push(`  · ${issue.name} (${issue.url})`);
    }

    out.textContent = lines.join("\n");
  }

  global.GraipCheckLibrary = checkLibrary;

  /**
   * Probe every known Wisp endpoint and report latency + failure reason. This is
   * the "is my route the problem?" button: it writes one log entry per endpoint,
   * so the exported log contains the whole picture.
   *
   * @param {HTMLElement} [button]
   */
  async function probeAllWispRoutes(button) {
    const wisp = global.GraipWisp;
    if (!wisp) return;

    const presets = wisp.PRESETS.slice();
    const local = wisp.localPreset ? wisp.localPreset() : null;
    if (local) presets.unshift(local);

    if (button) {
      button.disabled = true;
      button.textContent = "Testing…";
    }

    log("info", `probing ${presets.length} Wisp routes`);

    const results = [];
    // A little concurrency: fast enough to be useful, gentle enough not to look
    // like an attack from the user's network.
    for (let i = 0; i < presets.length; i += 3) {
      const batch = presets.slice(i, i + 3);
      const settled = await Promise.all(
        batch.map((preset) => wisp.probeWispServer(preset.url, { timeoutMs: 4000 }))
      );
      results.push(...settled);
    }

    const working = results.filter((result) => result.ok);
    const summary = results
      .map((result) => `${result.ok ? "ok" : "fail"} ${result.url} ${result.ms}ms${result.ok ? "" : " (" + result.reason + ")"}`)
      .join(" | ");

    log(working.length ? "info" : "error",
      `${working.length}/${results.length} Wisp routes answered`,
      { summary });

    if (typeof showToast === "function") {
      showToast(
        working.length ? "success" : "error",
        `${working.length}/${results.length} Wisp routes answered — see the log.`,
        working.length ? "fas fa-check-circle" : "fas fa-triangle-exclamation"
      );
    }

    if (button) {
      button.disabled = false;
      button.textContent = "Test all Wisp routes";
    }

    renderDebugPanel();
  }

  global.GraipProbeAll = probeAllWispRoutes;

  function boot() {
    applySavedCloak();
    bindPanicControls();
    bindDebugControls();

    // The inline openAB() in index.html is kept as a thin delegate (it is also
    // called from the auto-cloak path), so nothing to rebind here.

    log("debug", "settings panel ready");
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
