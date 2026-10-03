let aTab = 0;
let tabCounter = 1;
let bTabs = [];
// bare-mux is only used by the Ultraviolet backend now
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

const SEARCH_ENGINE_DEFAULT_MIGRATION = "cherri_searchEngineGoogleDefaultV1";
if (!localStorage.getItem(SEARCH_ENGINE_DEFAULT_MIGRATION)) {
  if (localStorage.getItem("cherri_searchEngine") === "DuckDuckGo") {
    localStorage.setItem("cherri_searchEngine", "Google");
  }
  localStorage.setItem(SEARCH_ENGINE_DEFAULT_MIGRATION, "1");
}

let searchE;
const se = localStorage.getItem("cherri_searchEngine") || "Google";

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
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const sw =
      navigator.serviceWorker.controller ||
      registration.active ||
      registration.waiting;

    if (!sw) {
      throw new Error(
        "Scramjet needs a controlling service worker, but none became active."
      );
    }

    const controller = new $scramjetController.Controller({
      serviceworker: sw,
      transport: await createTransport(CherriWisp.getConfiguredUrl()),
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

/** CherriWisp points a wisp server that answered at whatever transport is in use. */
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

  transportPromise = CherriWisp.configureTransport(transportTarget, {
    force,
    exclude: options && options.exclude,
    onStatus: (status) => {
      if (status.phase === "failed") {
        console.warn(
          `[cherri] wisp server ${status.result.url} is unreachable (${status.result.reason})`
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
  console.error("[cherri] proxy transport unavailable:", error);
  if (typeof showToast === "function") {
    showToast("error", CherriWisp.describeError(error), "triangle-exclamation");
  }
});

/**
 * @returns {boolean} whether the older Ultraviolet backend is the one in use
 */
function isUltravioletBackend() {
  return (
    (localStorage.getItem("cherri_backend") || "").toLowerCase() ===
      "ultraviolet" && typeof __uv$config !== "undefined"
  );
}

function newTab() {
  const tabCont = document.querySelector(".tabs");
  const nTab = {
    id: tabCounter++,
    title: "New Tab",
    url: "",
    history: [],
    historyIndex: -1,
  };

  bTabs.push(nTab);
  if (!tabCont) return;

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

  // Register the iframe with Scramjet instead of treating it as an unrelated
  // iframe. This gives Scramjet the frame metadata it needs for correct origin,
  // referrer, cookie and login handling. The controller needs a live service
  // worker first, so this happens as soon as it is ready and navigation waits
  // for it anyway.
  scramjetFrameFor(nTab.id, tabFrame).catch((error) => {
    console.error("[cherri] could not register the tab with Scramjet:", error);
  });

  tabFrame.src = "/newtab.html";

  document.body.appendChild(tabFrame);

  switchTab(nTab.id);
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
  }
}

function closeTab(tId) {
  if (bTabs.length === 1) {
    showToast("error", "Cannot close last tab!", "fas fa-circle-xmark");
    return;
  }

  const tIndex = bTabs.findIndex((t) => t.id === tId);
  if (tIndex === -1) return;

  bTabs.splice(tIndex, 1);

  const tEl = document.querySelector(`.tab[data-tab-id="${tId}"]`);
  const frame = document.querySelector(`.viewframe[data-frame-id="${tId}"]`);

  if (tEl) tEl.remove();
  if (frame) frame.remove();
  scramjetFrames.delete(tId);

  if (aTab === tId) {
    const newATab = bTabs[Math.max(0, tIndex - 1)];
    if (newATab) {
      switchTab(newATab.id);
    }
  }
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

  go(url);
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
    console.error("[cherri] proxy transport unavailable:", error);
    setTabError(CherriWisp.describeError(error), tabId);
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
          if (marker && marker.cherriProxyError) {
            const detail = iframeDoc.getElementById("cherri-proxy-message");
            handleProxyFailure(detail && detail.textContent, tabId);
            return;
          }
        }

        // A real page loaded, so any previous server attempts for this URL are
        // no longer needed.
        recoveryAttempts.delete(tabId);

        const title = iframeDoc.title || new URL(cTab.url).hostname;

        const tabEl = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabEl) {
          const titleEl = tabEl.querySelector("span");
          if (titleEl) titleEl.textContent = title;
        }

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
    setTabError(CherriWisp.describeError(e), tabId);
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
  const classification = globalThis.CherriProxyErrors
    ? globalThis.CherriProxyErrors.classify(errorMessage)
    : { kind: "other", message: errorMessage };
  const isPeerVerificationFailure = classification.kind === "peer-verification";
  const isRuntimeFailure = classification.kind === "runtime";
  const isTlsFailure = classification.kind === "tls-handshake";
  const isConnectivityFailure = classification.kind === "connectivity";
  const isRetryableRouteFailure = globalThis.CherriProxyErrors
    ? globalThis.CherriProxyErrors.shouldRetryRoute(classification)
    : isTlsFailure || isConnectivityFailure;

  if (isPeerVerificationFailure || isRuntimeFailure) {
    const detail = globalThis.CherriProxyErrors
      ? globalThis.CherriProxyErrors.userMessage(classification)
      : CherriWisp.describeError(errorMessage);
    if (!isPeerVerificationFailure) {
      setTabError(detail, tabId);
      return;
    }

    if (wispUrl) attempts.add(wispUrl);
    if (target) recoveryAttempts.set(tabId, { target, attempts });
    const maxAttempts = globalThis.CherriProxyErrors
      ? globalThis.CherriProxyErrors.maxRouteAttempts(classification)
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

  const maxAttempts = globalThis.CherriProxyErrors
    ? globalThis.CherriProxyErrors.maxRouteAttempts(classification)
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
    `[cherri] proxy route ${wispUrl || "unknown"} failed for ${targetHost}; trying another route`
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
        // whole cherri page, so other tabs and their sessions stay intact.
        go(target, tabId);
      }
      return nextUrl;
    })
    .catch((error) => {
      console.error("[cherri] could not find another proxy route:", error);
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
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  if (!viewframe) return;
  const curl = viewframe.src;

  // a dead wisp server may have come back up, so do not reuse the cached answer
  ensureTransport(true)
    .catch(() => {
      /* go() reports this; reloading should still be attempted */
    })
    .finally(() => {
      viewframe.src = curl;
    });
}

function full() {
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  viewframe.requestFullscreen();
}

function hideBrowser() {
  const b = document.querySelector(".browser-container");
  const frames = document.querySelectorAll(".viewframe");
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