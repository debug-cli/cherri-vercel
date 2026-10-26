let aTab = 0;
let tabCounter = 1;
let bTabs = [];

/**
 * bare-mux is only used by the Ultraviolet backend now, so it is created on
 * first use instead of at script evaluation. Constructing it eagerly meant a
 * missing/blocked /baremux/index.js or a worker that cannot start took the whole
 * file down with a ReferenceError, which also killed the Scramjet path that does
 * not need bare-mux at all.
 *
 * @returns {object|null} a BareMuxConnection, or null when bare-mux is missing
 */
let bareMuxConnection = null;
function getBareMuxConnection() {
  if (bareMuxConnection) return bareMuxConnection;
  if (typeof BareMux === "undefined" || !BareMux.BareMuxConnection) {
    console.warn("[graip] bare-mux is unavailable; the Ultraviolet backend cannot start");
    return null;
  }

  bareMuxConnection = new BareMux.BareMuxConnection("/baremux/worker.js");
  return bareMuxConnection;
}

const SEARCH_ENGINE_DEFAULT_MIGRATION = "graip_searchEngineGoogleDefaultV1";
if (!localStorage.getItem(SEARCH_ENGINE_DEFAULT_MIGRATION)) {
  if (localStorage.getItem("graip_searchEngine") === "DuckDuckGo") {
    localStorage.setItem("graip_searchEngine", "Google");
  }
  localStorage.setItem(SEARCH_ENGINE_DEFAULT_MIGRATION, "1");
}

let searchE;
const se = localStorage.getItem("graip_searchEngine") || "Google";

if (se === "DuckDuckGo") {
  searchE = "https://duckduckgo.com/search?q=";
} else if (se === "Bing") {
  searchE = "https://bing.com/search?q=";
} else if (se === "Google") {
  searchE = "https://google.com/search?q=";
} else if (se === "Startpage") {
  searchE = "https://startpage.com/search?q=";
} else if (se === "Qwant") {
  searchE = "https://qwant.com/search?q=";
} else {
  searchE = "https://search.brave.com/search?q=";
}

/**
 * Where the bundled Scramjet build keeps its parts. These are the names the
 * files were already served under, so nothing new stands out.
 */
const SCRAMJET_CONFIG = {
  prefix: "/~/sj/",
  scramjetPath: "/homework/math.all.js",
  injectPath: "/homework/science.sync.js",
  wasmPath: "/homework/history.wasm.wasm",
  virtualWasmPath: "scramjet.wasm.js",
};

const serviceWorkerReady =
  "serviceWorker" in navigator
    ? navigator.serviceWorker.ready
    : Promise.resolve();

/**
 * `serviceWorker.ready` only guarantees an active registration; it does not mean
 * this page is controlled yet. Scramjet's proxy URLs must be intercepted by the
 * page's controller, or the static host returns its own 404 for every target.
 *
 * @returns {Promise<ServiceWorker>}
 */
function waitForServiceWorkerControl() {
  const currentController = navigator.serviceWorker.controller;
  if (currentController) return Promise.resolve(currentController);

  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      clearTimeout(timeoutId);
    };
    const onControllerChange = () => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;
      cleanup();
      resolve(controller);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Scramjet's service worker is active but does not control this page. Reload the page so proxy requests can be intercepted."
        )
      );
    }, 10000);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );
    onControllerChange();
  });
}

/**
 * Small logging shim. assets/js/log.js loads before this file on every page that
 * includes it, but the browser helpers must also work when it does not (older
 * cached pages, tests), so every call degrades to a no-op.
 */
const graipLog = {
  d: (message, data) => window.GraipLog && window.GraipLog.debug("browser", message, data),
  i: (message, data) => window.GraipLog && window.GraipLog.info("browser", message, data),
  w: (message, data) => window.GraipLog && window.GraipLog.warn("browser", message, data),
  e: (message, data) => window.GraipLog && window.GraipLog.error("browser", message, data),
  a: (message, data) => window.GraipLog && window.GraipLog.action("browser", message, data),
};

/** Wisp endpoint the transport is currently connected to. */
let wispUrl = null;
let transportPromise = null;
let transportClassPromise = null;
let scramjetController = null;
let scramjetControllerPromise = null;
const scramjetFrames = new Map();
const recoveryAttempts = new Map();
let recoveryPromise = null;

/**
 * The libcurl transport only ships as an ES module, so it is pulled in on demand
 * instead of with a script tag.
 *
 * @returns {Promise<Function>} the transport class
 */
function loadTransportClass() {
  transportClassPromise ||= import("/libcurl/libcurl.mjs").then(
    (module) => module.default || module.LibcurlClient
  );

  return transportClassPromise;
}

/**
 * @param {string} server wisp endpoint
 * @returns {Promise<object>} a transport wired to that endpoint
 */
async function createTransport(server) {
  const LibcurlClient = await loadTransportClass();

  return new LibcurlClient({ wisp: server });
}

/**
 * Scramjet is driven from this page now: the service worker only forwards
 * proxied requests to a controller created here, so it has to exist before the
 * first navigation. Cookie state lives with the controller too, which is why it
 * waits for its IndexedDB record before a login page can make its first request.
 *
 * @returns {Promise<object>} the page side Scramjet controller
 */
function initScramjetController() {
  scramjetControllerPromise ||= (async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Do not initialize Scramjet against `registration.active` unless it is
    // actually controlling this document: otherwise /~/sj/* requests fall
    // through to the host's static 404 handler instead of reaching Scramjet.
    const sw = await waitForServiceWorkerControl();

    const controller = new $scramjetController.Controller({
      serviceworker: sw,
      transport: await createTransport(GraipWisp.getConfiguredUrl()),
      config: SCRAMJET_CONFIG,
    });

    await controller.wait();
    scramjetController = controller;

    return controller;
  })().catch((error) => {
    // do not cache the failure, a later tab should be able to retry
    scramjetControllerPromise = null;
    throw error;
  });

  return scramjetControllerPromise;
}

/**
 * Every tab gets its own Scramjet frame, registered the first time it is needed.
 *
 * @param {number} tabId
 * @param {HTMLIFrameElement} [element]
 * @returns {Promise<object>} the frame for that tab
 */
async function scramjetFrameFor(tabId, element) {
  const controller = await initScramjetController();
  let frame = scramjetFrames.get(tabId);

  if (!frame && element) {
    frame = controller.createFrame(element);
    scramjetFrames.set(tabId, frame);
  }

  return frame;
}

/** GraipWisp points a wisp server that answered at whatever transport is in use. */
const transportTarget = {
  async setTransport(server) {
    const controller = await initScramjetController();

    controller.setTransport(await createTransport(server));
  },
};

/**
 * Make sure the libcurl transport is attached to a wisp server that actually
 * answers before anything is proxied through it. A dead server is what produces
 * "Request failed with error code 7: Could not connect to server" from libcurl, so
 * the endpoint is health checked (and failed over) here instead of at request time.
 *
 * @param {boolean} [force] re-probe even when a server already passed
 * @param {{ exclude?: string[] }} [options]
 * @returns {Promise<string>} the endpoint in use
 */
function ensureTransport(force, options) {
  if (transportPromise && !force && !(options && options.exclude?.length)) {
    return transportPromise;
  }

  transportPromise = GraipWisp.configureTransport(transportTarget, {
    force,
    exclude: options && options.exclude,
    onStatus: (status) => {
      if (status.phase === "failed") {
        console.warn(
          `[graip] wisp server ${status.result.url} is unreachable (${status.result.reason})`
        );
      }
    },
  })
    .then((url) => {
      wispUrl = url;
      return url;
    })
    .catch((error) => {
      transportPromise = null;
      throw error;
    });

  return transportPromise;
}

// warm the transport up on load so the first navigation does not pay for it
ensureTransport().catch((error) => {
  console.error("[graip] proxy transport unavailable:", error);
  if (typeof showToast === "function") {
    showToast("error", GraipWisp.describeError(error), "triangle-exclamation");
  }
});

/**
 * @returns {boolean} whether the older Ultraviolet backend is the one in use
 */
function isUltravioletBackend() {
  return (
    (localStorage.getItem("graip_backend") || "").toLowerCase() ===
      "ultraviolet" && typeof __uv$config !== "undefined"
  );
}

/**
 * Tab sessions are kept in sessionStorage so a reload, a crashed frame, or the
 * service worker taking control does not throw away every open tab. The key is
 * per page (the full browser and the mini browser keep separate sessions) and it
 * is *session* storage: closing the browser window still forgets everything.
 */
const TAB_STORAGE_PREFIX = "graip_tabs:";

function tabStorageKey() {
  const path = (window.location && window.location.pathname) || "/pages/browser.html";
  return TAB_STORAGE_PREFIX + path;
}

function saveTabSession() {
  try {
    const rows = bTabs.map((tab) => ({
      id: tab.id,
      title: tab.title || "New Tab",
      url: tab.url || "",
      history: Array.isArray(tab.history) ? tab.history.slice(-30) : [],
      historyIndex: tab.historyIndex,
    }));
    sessionStorage.setItem(
      tabStorageKey(),
      JSON.stringify({ active: aTab, counter: tabCounter, tabs: rows })
    );
  } catch (error) {
    graipLog.w("could not persist the tab session", error);
  }
}

function readTabSession() {
  try {
    const raw = sessionStorage.getItem(tabStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tabs) || !parsed.tabs.length) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

/** Forget the stored session (used by the panic key and by "clear traces"). */
function clearTabSession() {
  try {
    sessionStorage.removeItem(tabStorageKey());
  } catch (error) {
    /* ignore */
  }
}

/**
 * Drop one tab from the tab strip and the frame list.
 *
 * @param {number} tabId
 */
function removeTabElements(tabId) {
  const tEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  const frame = document.querySelector(`.viewframe[data-frame-id="${tabId}"]`);
  if (tEl) tEl.remove();
  if (frame) frame.remove();
  scramjetFrames.delete(tabId);
}

function setTabTitle(tabId, title) {
  const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (!tabEl) return;
  const titleEl = tabEl.querySelector("span");
  if (titleEl) titleEl.textContent = title;
}

/**
 * Create one tab (state + strip entry + frame) and make it active.
 *
 * @param {{ url?: string, title?: string, history?: string[], historyIndex?: number, activate?: boolean }} [initial]
 * @returns {object|null} the tab state
 */
function newTab(initial) {
  const tabCont = document.querySelector(".tabs");
  const seed = initial || {};
  const nTab = {
    id: tabCounter++,
    title: seed.title || "New Tab",
    url: seed.url || "",
    history: Array.isArray(seed.history) ? seed.history.slice() : [],
    historyIndex: Number.isInteger(seed.historyIndex) ? seed.historyIndex : -1,
    // restored tabs only navigate when they are actually looked at
    restoreUrl: seed.url || "",
  };

  bTabs.push(nTab);
  if (!tabCont) return nTab;

  const ntBtn = document.querySelector(".newtab");

  const tabElement = document.createElement("div");
  tabElement.classList.add("tab", "hcontainer");
  tabElement.dataset.tabId = nTab.id;
  tabElement.innerHTML = `
        <img src="/assets/img/fav.png" id="fav" data-fav-id="${nTab.id}" width="24" alt="">
            <span>
                New Tab
            </span>
        <i class="fas fa-times close-btn"></i>
        `;
  const label = tabElement.querySelector("span");
  if (label) label.textContent = nTab.title;

  tabElement.addEventListener("click", (e) => {
    if (!e.target.closest(".close-btn")) {
      switchTab(nTab.id);
    }
  });

  const closebtn = tabElement.querySelector(".close-btn");
  closebtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(nTab.id);
  });

  tabCont.insertBefore(tabElement, ntBtn);

  const tabFrame = document.createElement("iframe");
  tabFrame.classList.add("viewframe", "browser-frame");
  tabFrame.dataset.frameId = nTab.id;
  tabFrame.setAttribute("allowfullscreen", "true");
  // A proxied page must not learn where it is being embedded from.
  tabFrame.setAttribute("referrerpolicy", "no-referrer");

  // Register the iframe with Scramjet instead of treating it as an unrelated
  // iframe. This gives Scramjet the frame metadata it needs for correct origin,
  // referrer, cookie and login handling. The controller needs a live service
  // worker first, so this happens as soon as it is ready and navigation waits
  // for it anyway.
  scramjetFrameFor(nTab.id, tabFrame).catch((error) => {
    console.error("[graip] could not register the tab with Scramjet:", error);
    graipLog.w("could not register a tab with Scramjet", error);
  });

  tabFrame.src = "/newtab.html";

  document.body.appendChild(tabFrame);

  if (seed.activate !== false) switchTab(nTab.id);
  graipLog.a("tab opened", { tabs: bTabs.length });
  saveTabSession();
  return nTab;
}

/**
 * Rebuild the tabs from the previous session in this window. Falls back to a
 * single blank tab when there is nothing to restore (or the data is unusable).
 *
 * @returns {number} how many tabs were restored
 */
function restoreTabSession() {
  if (bTabs.length) return bTabs.length;

  const saved = readTabSession();
  if (!saved) {
    newTab();
    return bTabs.length;
  }

  let restored = 0;
  for (const row of saved.tabs) {
    if (!row || typeof row !== "object") continue;
    const tab = newTab({
      url: typeof row.url === "string" ? row.url : "",
      title: typeof row.title === "string" ? row.title : "New Tab",
      history: row.history,
      historyIndex: row.historyIndex,
      activate: false,
    });
    if (tab) restored++;
  }

  if (!restored) {
    newTab();
    return bTabs.length;
  }

  tabCounter = Math.max(tabCounter, Number(saved.counter) || tabCounter);
  const active = bTabs.find((tab) => tab.id === saved.active);
  switchTab(active ? active.id : bTabs[bTabs.length - 1].id);
  graipLog.i("restored the tab session", { tabs: restored });
  return restored;
}

function switchTab(tId) {
  aTab = tId;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", parseInt(tab.dataset.tabId) === tId);
  });

  document.querySelectorAll(".viewframe").forEach((frame) => {
    frame.classList.toggle("active", parseInt(frame.dataset.frameId) === tId);
  });

  const cTab = bTabs.find((t) => t.id === tId);
  if (cTab) {
    const input = document.getElementById("searchbar");
    if (input) input.value = cTab.url;

    // A restored tab is loaded the first time it is shown, so ten open tabs do
    // not mean ten proxy navigations on startup.
    if (cTab.restoreUrl) {
      const pending = cTab.restoreUrl;
      cTab.restoreUrl = "";
      if (pending) {
        graipLog.a("restored tab navigates", { url: pending });
        go(pending, tId);
      }
    }
    graipLog.a("tab switched", { tabId: tId });
  }
  saveTabSession();
}

function closeTab(tId) {
  if (bTabs.length === 1) {
    showToast("error", "Cannot close last tab!", "fas fa-circle-xmark");
    return;
  }

  const tIndex = bTabs.findIndex((t) => t.id === tId);
  if (tIndex === -1) return;

  const closing = bTabs[tIndex];
  // remember it for Ctrl+Shift+T (in-memory only: a reload forgets closed tabs)
  if (closing && closing.url) {
    closedTabs.push({
      url: closing.url,
      title: closing.title,
      history: closing.history.slice(),
      historyIndex: closing.historyIndex,
    });
    if (closedTabs.length > 10) closedTabs.shift();
  }

  bTabs.splice(tIndex, 1);
  removeTabElements(tId);

  if (aTab === tId) {
    const newATab = bTabs[Math.max(0, tIndex - 1)];
    if (newATab) {
      switchTab(newATab.id);
    }
  }

  graipLog.a("tab closed", { tabs: bTabs.length });
  saveTabSession();
}

function nav(i) {
  if (typeof i !== "string" || !i.trim()) return;

  let url = i.trim();

  if (!url.includes(".") || url.includes(" ")) {
    url = searchE + encodeURIComponent(url);
  } else {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
  }

  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab) return;

  cTab.history.push(url);
  cTab.historyIndex++;

  cTab.url = url;
  graipLog.a("navigate", { url });

  go(url);
}

/**
 * Keep proxied URLs out of places that outlive the visit.
 *
 * Two things leak here:
 *  - the top-level document's own URL, which the browser shows (and keeps in
 *    history) when the user later navigates away;
 *  - the tab strip, which is fine on screen but must not be remembered after a
 *    panic.
 *
 * The address bar inside the app still shows the visited URL (that is the whole
 * point of an omnibox), but the *document* URL is rewritten to a path-only value
 * and anything stored is scrubbed by clearBrowserTraces().
 */
function scrubDocumentUrl() {
  try {
    const here = new URL(window.location.href);
    if (!here.search) return;
    // `launch` is the only parameter the page needs to boot with a browser UI;
    // everything else (?url=, ?site=, ...) is dropped from history.
    const keep = new URLSearchParams();
    if (here.searchParams.get("launch")) keep.set("launch", "1");
    const query = keep.toString();
    window.history.replaceState({}, "", here.pathname + (query ? `?${query}` : "") + here.hash);
  } catch (error) {
    /* history API can be unavailable in odd embeddings */
  }
}

/**
 * Remove every trace this tab left behind: the tab session, the last URL and the
 * partly-remembered address. Used before a panic navigation and by the explicit
 * "Clear session traces" button in Settings.
 */
function clearBrowserTraces() {
  if (typeof clearTabSession === "function") clearTabSession();
  try {
    localStorage.removeItem("graip_lastUrl");
  } catch (error) {
    /* ignore */
  }
  scrubDocumentUrl();
  graipLog.i("browser traces cleared");
}

function updateUrlFromIframe(viewframe, tabId = aTab) {
  try {
    const cTab = bTabs.find((t) => t.id === tabId);
    if (!cTab) return;

    let decodedUrl;
    const currentSrc = viewframe.src;

    if (isUltravioletBackend()) {
      if (currentSrc.includes("/uv/service/")) {
        decodedUrl = __uv$config.decodeUrl(currentSrc.split("/uv/service/")[1]);
      }
    } else {
      // every Scramjet frame has its own prefix, so strip it and decode the rest
      const frame = scramjetFrames.get(tabId);

      if (frame && currentSrc.startsWith(frame.prefix)) {
        try {
          decodedUrl = decodeURIComponent(
            currentSrc.slice(frame.prefix.length)
          );
        } catch (e) {
          decodedUrl = currentSrc.slice(frame.prefix.length);
        }
      }
    }

    if (decodedUrl && decodedUrl !== cTab.url) {
      cTab.url = decodedUrl;
      cTab.title = viewframe.contentDocument && viewframe.contentDocument.title
        ? viewframe.contentDocument.title
        : cTab.title;
      graipLog.d("url changed", { url: decodedUrl });
      saveTabSession();

      const ubar = document.getElementById("searchbar");
      if (ubar && tabId === aTab) ubar.value = decodedUrl;

      const favEl = document.querySelector(`#fav[data-fav-id="${tabId}"]`);
      if (favEl) {
        const faviconDomain = new URL(decodedUrl).hostname;
        favEl.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=32`;
      }
    }
  } catch (e) {
    console.error("Error updating URL from iframe:", e);
  }
}

async function go(target, tabId = aTab) {
  const cTab = bTabs.find((t) => t.id === tabId);
  const favEl = document.querySelector(`#fav[data-fav-id="${tabId}"]`);
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${tabId}"]`
  );
  if (!viewframe) return;

  const ubar = document.getElementById("searchbar");

  const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector("span");
    if (titleEl) titleEl.textContent = "Loading...";
  }

  if (!cTab) return;
  graipLog.a("loading url", { url: cTab.url, tabId });
  if (ubar && tabId === aTab) ubar.value = cTab.url;
  if (favEl) {
    const faviconDomain = new URL(cTab.url).hostname;
    favEl.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=32`;
  }

  try {
    // Wait for every side of the proxy to be ready: the service worker that
    // serves the frame, the Scramjet controller in this page, and a wisp server
    // that answered a handshake.
    await Promise.all([
      initScramjetController(),
      serviceWorkerReady,
      ensureTransport(),
    ]);
  } catch (error) {
    console.error("[graip] proxy transport unavailable:", error);
    setTabError(GraipWisp.describeError(error), tabId);
    return;
  }

  try {
    viewframe.onload = () => {
      try {
        const iframeDoc =
          viewframe.contentDocument || viewframe.contentWindow.document;

        // sw.js stamps the page it renders when the proxy server is unreachable,
        // which is how a server that dies mid-session gets noticed
        if (iframeDoc && iframeDoc.documentElement) {
          const marker = iframeDoc.documentElement.dataset;
          if (marker && marker.graipProxyError) {
            const detail = iframeDoc.getElementById("graip-proxy-message");
            handleProxyFailure(detail && detail.textContent, tabId);
            return;
          }
        }

        // A real page loaded, so any previous server attempts for this URL are
        // no longer needed.
        recoveryAttempts.delete(tabId);

        const title = iframeDoc.title || new URL(cTab.url).hostname;

        cTab.title = title;
        setTabTitle(tabId, title);
        saveTabSession();

        updateUrlFromIframe(viewframe, tabId);
      } catch (e) {
        console.error("Error accessing iframe content:", e);
        const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabEl) {
          const titleEl = tabEl.querySelector("span");
          if (titleEl) titleEl.textContent = new URL(cTab.url).hostname;
        }

        updateUrlFromIframe(viewframe, tabId);
      }
    };

    if (isUltravioletBackend()) {
      // Ultraviolet still talks through bare-mux, so it keeps the old transport
      const connection = getBareMuxConnection();
      if (!connection) {
        setTabError(
          "The Ultraviolet backend needs bare-mux, which did not load. Pick Scramjet in Settings or reload.",
          tabId
        );
        return;
      }

      if (!(await connection.getTransport())) {
        await connection.setTransport("/libcurl/index.mjs", [
          { websocket: await ensureTransport() },
        ]);
      }

      viewframe.src = __uv$config.prefix + __uv$config.encodeUrl(target);
    } else {
      (await scramjetFrameFor(tabId, viewframe)).go(target);
    }
  } catch (e) {
    console.error("There was an error while loading the page:", e);
    setTabError(GraipWisp.describeError(e), tabId);
  }
}

/**
 * Put a readable failure on the tab instead of leaving a blank frame behind.
 *
 * @param {string} message
 */
function setTabError(message, tabId = aTab) {
  const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector("span");
    if (titleEl) titleEl.textContent = "Proxy unavailable";
  }

  if (typeof showToast === "function") {
    showToast("error", message, "triangle-exclamation");
  }
}

/**
 * Route retries can recover from unavailable endpoints and destination-specific
 * TLS failures on a particular Wisp exit. Certificate verification stays enabled;
 * curl 60 receives only one alternate-route attempt.
 *
 * @param {string} [message]
 */
async function handleProxyFailure(message, tabId = aTab) {
  const cTab = bTabs.find((t) => t.id === tabId);
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${tabId}"]`
  );
  const target = cTab && cTab.url;
  const previousRecovery = recoveryAttempts.get(tabId);
  const attempts =
    target && previousRecovery && previousRecovery.target === target
      ? previousRecovery.attempts
      : new Set();

  const errorMessage = message || "";
  const classification = globalThis.GraipProxyErrors
    ? globalThis.GraipProxyErrors.classify(errorMessage)
    : { kind: "other", message: errorMessage };
  const isPeerVerificationFailure = classification.kind === "peer-verification";
  const isRuntimeFailure = classification.kind === "runtime";
  const isTlsFailure = classification.kind === "tls-handshake";
  const isConnectivityFailure = classification.kind === "connectivity";
  const isRetryableRouteFailure = globalThis.GraipProxyErrors
    ? globalThis.GraipProxyErrors.shouldRetryRoute(classification)
    : isTlsFailure || isConnectivityFailure;

  if (isPeerVerificationFailure || isRuntimeFailure) {
    const detail = globalThis.GraipProxyErrors
      ? globalThis.GraipProxyErrors.userMessage(classification)
      : GraipWisp.describeError(errorMessage);
    if (!isPeerVerificationFailure) {
      setTabError(detail, tabId);
      return;
    }

    if (wispUrl) attempts.add(wispUrl);
    if (target) recoveryAttempts.set(tabId, { target, attempts });
    const maxAttempts = globalThis.GraipProxyErrors
      ? globalThis.GraipProxyErrors.maxRouteAttempts(classification)
      : 2;
    const canRetry = Boolean(wispUrl) && attempts.size < maxAttempts;
    setTabError(
      canRetry
        ? `${detail} Trying one alternate Wisp route; certificate checks remain enabled.`
        : `${detail} No further route retries will be attempted automatically.`,
      tabId
    );
    if (!canRetry) return;
    return retryProxyRoute(target, viewframe, attempts, maxAttempts, tabId);
  }

  if (wispUrl) attempts.add(wispUrl);
  if (target) recoveryAttempts.set(tabId, { target, attempts });

  setTabError(
    isTlsFailure
      ? "That proxy route could not complete the site's secure connection. Trying another route..."
      : isRetryableRouteFailure
        ? "The proxy route stopped responding. Trying another one..."
        : message || "The proxy request failed. Check the error above before retrying.",
    tabId
  );

  if (!isRetryableRouteFailure || !target || !viewframe) return;

  const maxAttempts = globalThis.GraipProxyErrors
    ? globalThis.GraipProxyErrors.maxRouteAttempts(classification)
    : 6;
  return retryProxyRoute(target, viewframe, attempts, maxAttempts, tabId);
}

async function retryProxyRoute(target, viewframe, attempts, maxAttempts, tabId) {
  if (!target || !viewframe || attempts.size >= maxAttempts) return;
  if (recoveryPromise) {
    return recoveryPromise.then((nextUrl) => {
      if (!nextUrl || attempts.has(nextUrl) || attempts.size >= maxAttempts) return;
      attempts.add(nextUrl);
      recoveryAttempts.set(tabId, { target, attempts });

      const currentTab = bTabs.find((tab) => tab.id === tabId);
      if (currentTab && currentTab.url === target) go(target, tabId);
    });
  }

  let targetHost = "unknown";
  try {
    targetHost = new URL(target).hostname;
  } catch (error) {
    /* Never log a full URL; malformed input has no safe hostname to report. */
  }
  console.warn(
    `[graip] proxy route ${wispUrl || "unknown"} failed for ${targetHost}; trying another route`
  );

  recoveryPromise = ensureTransport(true, {
    exclude: [...attempts],
  })
    .then((nextUrl) => {
      attempts.add(nextUrl);
      recoveryAttempts.set(tabId, { target, attempts });

      const currentTab = bTabs.find((tab) => tab.id === tabId);
      if (currentTab && currentTab.url === target) {
        // The new transport is ready. Reload only this failed tab, not the
        // whole graip page, so other tabs and their sessions stay intact.
        go(target, tabId);
      }
      return nextUrl;
    })
    .catch((error) => {
      console.error("[graip] could not find another proxy route:", error);
      setTabError(
        "No working proxy route was found. Try Settings -> Proxy -> Wisp.",
        tabId
      );
      return null;
    })
    .finally(() => {
      recoveryPromise = null;
    });

  return recoveryPromise;
}

/**
 * Omnibox keyboard shortcuts for the browser pages.
 *
 * Ctrl+L focuses the address bar with its contents selected, Ctrl+T opens a tab,
 * Ctrl+W closes the current one, Ctrl+Shift+T reopens the last closed one and
 * Alt+Left/Right walks the tab history. Shortcuts only fire inside the browser
 * pages, and never while typing in a text field (except the ones that are meant
 * to work there, like Ctrl+L).
 */
const closedTabs = [];
let omniboxInstalled = false;

function installOmnibox() {
  if (omniboxInstalled) return;
  omniboxInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      const key = (event.key || "").toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      const target = event.target;
      const tag = (target && target.tagName) || "";
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (target && target.isContentEditable);

      if (mod && key === "l") {
        event.preventDefault();
        const input = document.getElementById("searchbar");
        if (input) {
          input.focus();
          input.select();
          graipLog.a("omnibox focused");
        }
        return;
      }

      if (mod && key === "t") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) {
          const last = closedTabs.pop();
          if (!last) return;
          const tab = newTab({ url: last.url, title: last.title, history: last.history, historyIndex: last.historyIndex });
          if (tab) tab.restoreUrl = last.url || "";
          graipLog.a("reopened closed tab");
          return;
        }
        newTab();
        const input = document.getElementById("searchbar");
        if (input) input.focus();
        return;
      }

      if (mod && key === "w") {
        if (typing) return;
        event.preventDefault();
        closeTab(aTab);
        return;
      }

      if (event.altKey && (key === "arrowleft" || key === "arrowright")) {
        if (typing) return;
        event.preventDefault();
        if (key === "arrowleft") b();
        else f();
      }
    },
    true
  );

  graipLog.d("omnibox shortcuts installed");
}

/**
 * Turn address-bar input into a navigation, including search bangs:
 * `!g cats`, `!yt lofi`, `!w entropy`, `!ddg ...`. Anything else is treated as a
 * URL, exactly like nav() does.
 *
 * @param {string} raw
 * @returns {string} the URL that nav() should load
 */
function resolveOmniboxInput(raw) {
  const input = (raw || "").trim();
  const bangs = {
    "!g": "https://google.com/search?q=",
    "!ddg": "https://duckduckgo.com/?q=",
    "!b": "https://bing.com/search?q=",
    "!yt": "https://www.youtube.com/results?search_query=",
    "!w": "https://en.wikipedia.org/w/index.php?search=",
    "!gh": "https://github.com/search?q=",
    "!r": "https://www.reddit.com/search/?q=",
  };

  const match = input.match(/^(![a-z]+)\s+(.+)$/i);
  if (match) {
    const engine = bangs[match[1].toLowerCase()];
    if (engine) {
      graipLog.a("omnibox bang", { bang: match[1].toLowerCase() });
      return engine + encodeURIComponent(match[2]);
    }
  }

  const configured = localStorage.getItem("graip_searchEngine") || "Google";
  const searchUrls = {
    Google: "https://google.com/search?q=",
    DuckDuckGo: "https://duckduckgo.com/?q=",
    Bing: "https://bing.com/search?q=",
    Startpage: "https://www.startpage.com/sp/search?query=",
    Qwant: "https://www.qwant.com/?q=",
    Brave: "https://search.brave.com/search?q=",
  };

  const looksLikeUrl =
    !input.includes(" ") &&
    (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ||
      /^[^\s/]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(input) ||
      input.startsWith("localhost"));

  if (looksLikeUrl) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : "https://" + input;
  }

  return (searchUrls[configured] || searchUrls.Google) + encodeURIComponent(input);
}

/**
 * Wire the address bar: Enter navigates, and the empty state searches.
 * Existing pages already bind Enter to their own handler, so this only adds the
 * bang handling there is no equivalent of.
 */
function installOmniboxInput() {
  const input = document.getElementById("searchbar");
  if (!input || input.dataset.graipOmnibox === "1") return;
  input.dataset.graipOmnibox = "1";

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const value = input.value.trim();
    if (!value) return;
    if (!/^(![a-z]+\s)/i.test(value) && !value.startsWith("!")) {
      // no bang: leave the page's own handler in charge
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const target = resolveOmniboxInput(value);
    const cTab = bTabs.find((t) => t.id === aTab);
    if (cTab) {
      cTab.history.push(target);
      cTab.historyIndex++;
      cTab.url = target;
    }
    go(target);
  }, true);

  graipLog.d("omnibox input installed");
}

function b() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab || cTab.historyIndex <= 0) return;

  cTab.historyIndex--;
  const u = cTab.history[cTab.historyIndex];
  cTab.url = u;

  go(u);
}

function f() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab || cTab.historyIndex + 1 >= cTab.history.length) return;

  cTab.historyIndex++;
  const u = cTab.history[cTab.historyIndex];
  cTab.url = u;

  go(u);
}

function r() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab) return;

  // A dead wisp server may have come back up, so do not reuse the cached
  // answer. Navigate through go() instead of setting iframe.src directly: that
  // resets the per-tab route-recovery state and re-runs Scramjet's frame
  // navigation, which is what actually re-issues the request through the new
  // transport. Assigning src kept a failed tab pinned to its old transport.
  ensureTransport(true)
    .catch((error) => {
      console.error("[graip] reload could not refresh the proxy route:", error);
    })
    .finally(() => {
      const target = cTab.url;
      if (target) go(target, aTab);
    });
}

function full() {
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  if (!viewframe) return;
  viewframe.requestFullscreen();
}

function hideBrowser() {
  const b = document.querySelector(".browser-container");
  const frames = document.querySelectorAll(".viewframe");
  if (!b) return;
  b.style.opacity = 0;
  frames.forEach((frame) => {
    frame.style.opacity = 0;
    frame.style.pointerEvents = "none";
  });
  b.style.pointerEvents = "none";
}

async function launchEruda() {
  showToast("info", "Launching Eruda...", "fas fa-info-circle");
  try {
    eruda.init();
    showToast(
      "success",
      "Successfully injected Eruda",
      "fa-solid fa-check-circle"
    );
  } catch (e) {
    showToast("error", "Failed to inject Eruda", "fas fa-times-circle");
  }
}

async function fixProxy() {
  await ensureTransport(true);

  showToast("success", "Connection reset to Libcurl!", "fas fa-check-circle")
  console.log(
    "%c[SUCCESS]" + "%c Connection reset to Libcurl.",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );

  await navigator.serviceWorker.register("/sw.js")

  showToast("success", "Service workers reregistered. (1/2)", "fas fa-check-circle");
  console.log(
    "%c[SUCCESS]" + "%c Service workers reregistered. (1/2)",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );

  await navigator.serviceWorker.register("/uv/sw.js")

  showToast("success", "Service workers reregistered. (2/2)", "fas fa-check-circle");
  console.log(
    "%c[SUCCESS]" + "%c Service workers reregistered. (2/2)",
    "color: lime; font-weight: bold;",
    "color: white; font-weight: normal;"
  );
}

/**
 * Boot the browser chrome once the DOM exists: restore the session, install the
 * shortcuts and the address bar hooks, and make the panic key available.
 *
 * Pages still call newTab()/restoreTabSession() themselves; this only adds the
 * behaviours that do not belong in their inline scripts.
 */
window.addEventListener("DOMContentLoaded", () => {
  installOmnibox();
  installOmniboxInput();
  scrubDocumentUrl();

  if (window.GraipCloak) {
    window.GraipCloak.installPanicKey();
    // A panic replaces this document, but sessionStorage outlives the swap, so
    // the tabs the user had open are still on disk. Keep them: returning from a
    // panic used to wipe the session and reopen on one blank tab, which looked
    // like a brand-new open. `pagehide` saved the session on the way out, so
    // restoreTabSession() below brings it back where it was.
    if (sessionStorage.getItem("graip_panicReturn") === "1") {
      sessionStorage.removeItem("graip_panicReturn");
      graipLog.i("panic return: tab session kept for the return");
    }
  }

  if (window.GraipLog) window.GraipLog.configureServiceWorker();
  graipLog.d("browser helpers ready", { tabs: bTabs.length });
});

// keep the stored session current when the page goes away
window.addEventListener("pagehide", () => {
  if (typeof saveTabSession === "function" && bTabs.length) saveTabSession();
});
