let aTab = 0;
let tabCounter = 1;
let bTabs = [];
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

let searchE;
const se = localStorage.getItem("cherri_searchEngine") || "DuckDuckGo";

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

const CONFIG = {
  files: {
    wasm: "/homework/history.wasm.wasm",
    all: "/homework/math.all.js",
    sync: "/homework/science.sync.js",
  },
};

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: CONFIG.files,
});

// Do not start the first page until Scramjet has finished opening its cookie
// database. Otherwise a login page can make its first requests before the saved
// session/CSRF cookies have been loaded.
const scramjetReady = scramjet.init();
const serviceWorkerReady =
  "serviceWorker" in navigator
    ? navigator.serviceWorker.ready
    : Promise.resolve();

/** Endpoint bare-mux is currently wired to, once the transport is up. */
let wispUrl = null;
let transportPromise = null;
const scramjetFrames = new Map();
const recoveryAttempts = new Map();
let recoveryPromise = null;

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

  transportPromise = CherriWisp.configureTransport(connection, {
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
 * @param {string} url
 * @returns {string} the proxied URL for whichever backend is configured
 */
function encodeForBackend(url) {
  const backend = (
    localStorage.getItem("cherri_backend") || "Scramjet"
  ).toLowerCase();

  if (backend === "ultraviolet" && typeof __uv$config !== "undefined") {
    return __uv$config.prefix + __uv$config.encodeUrl(url);
  }

  return scramjet.encodeUrl(url);
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
  // referrer, cookie and login handling.
  scramjetFrames.set(nTab.id, scramjet.createFrame(tabFrame));
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

  go(encodeForBackend(url));
}

function updateUrlFromIframe(viewframe) {
  try {
    const cTab = bTabs.find((t) => t.id === aTab);
    if (!cTab) return;

    let decodedUrl;
    const currentSrc = viewframe.src;

    if (
      (localStorage.getItem("cherri_backend") || "").toLowerCase() ===
        "ultraviolet" &&
      typeof __uv$config !== "undefined"
    ) {
      if (currentSrc.includes("/uv/service/")) {
        decodedUrl = __uv$config.decodeUrl(currentSrc.split("/uv/service/")[1]);
      }
    } else {
      decodedUrl = scramjet.decodeUrl(currentSrc);
    }

    if (decodedUrl && decodedUrl !== cTab.url) {
      cTab.url = decodedUrl;

      const ubar = document.getElementById("searchbar");
      if (ubar) ubar.value = decodedUrl;

      const favEl = document.querySelector(`#fav[data-fav-id="${aTab}"]`);
      if (favEl)
        favEl.src = `https://www.google.com/s2/favicons?domain=${decodedUrl}&sz=256`;
    }
  } catch (e) {
    console.error("Error updating URL from iframe:", e);
  }
}

async function go(u) {
  const cTab = bTabs.find((t) => t.id === aTab);
  const favEl = document.querySelector(`#fav[data-fav-id="${aTab}"]`);
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  if (!viewframe) return;

  const ubar = document.getElementById("searchbar");

  const tabEl = document.querySelector(`.tab[data-tab-id="${aTab}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector("span");
    if (titleEl) titleEl.textContent = "Loading...";
  }

  if (ubar) ubar.value = cTab.url;
  const favUrl = cTab.url;
  if (favEl)
    favEl.src = `https://www.google.com/s2/favicons?domain=${favUrl}&sz=256`;

  try {
    // Wait for every side of the proxy to be ready. In particular, Scramjet
    // needs its IndexedDB cookie jar and service worker ready before a login
    // page makes its first requests.
    await Promise.all([scramjetReady, serviceWorkerReady, ensureTransport()]);
  } catch (error) {
    console.error("[cherri] proxy transport unavailable:", error);
    setTabError(CherriWisp.describeError(error));
    return;
  }

  try {
    viewframe.src = u;

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
            handleProxyFailure(detail && detail.textContent);
            return;
          }
        }

        // A real page loaded, so any previous server attempts for this URL are
        // no longer needed.
        recoveryAttempts.delete(cTab.url);

        const title = iframeDoc.title || new URL(cTab.url).hostname;

        const tabEl = document.querySelector(`.tab[data-tab-id="${aTab}"]`);
        if (tabEl) {
          const titleEl = tabEl.querySelector("span");
          if (titleEl) titleEl.textContent = title;
        }

        updateUrlFromIframe(viewframe);
      } catch (e) {
        console.error("Error accessing iframe content:", e);
        const tabEl = document.querySelector(`.tab[data-tab-id="${aTab}"]`);
        if (tabEl) {
          const titleEl = tabEl.querySelector("span");
          if (titleEl) titleEl.textContent = new URL(cTab.url).hostname;
        }

        updateUrlFromIframe(viewframe);
      }
    };
  } catch (e) {
    console.error("There was an error while loading the page:", e);
    setTabError(CherriWisp.describeError(e));
  }
}

/**
 * Put a readable failure on the tab instead of leaving a blank frame behind.
 *
 * @param {string} message
 */
function setTabError(message) {
  const tabEl = document.querySelector(`.tab[data-tab-id="${aTab}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector("span");
    if (titleEl) titleEl.textContent = "Proxy unavailable";
  }

  if (typeof showToast === "function") {
    showToast("error", message, "triangle-exclamation");
  }
}

/**
 * The transport was already configured, so a failure here means either the
 * server died or that particular exit could not complete the destination's TLS
 * handshake. Try a different Wisp server and automatically retry the same URL.
 *
 * @param {string} [message]
 */
async function handleProxyFailure(message) {
  const cTab = bTabs.find((t) => t.id === aTab);
  const viewframe = document.querySelector(
    `.viewframe[data-frame-id="${aTab}"]`
  );
  const target = cTab && cTab.url;
  const attempts = target
    ? recoveryAttempts.get(target) || new Set()
    : new Set();

  if (wispUrl) attempts.add(wispUrl);
  if (target) recoveryAttempts.set(target, attempts);

  const isTlsFailure = /error code 35|ssl connect error|tls/i.test(
    message || ""
  );
  const isWasmFailure = /wasm not loaded|load_wasm|failed to load wasm/i.test(
    message || ""
  );

  if (isWasmFailure) {
    setTabError(
      "The proxy's WebAssembly runtime did not load. Reload the page and try again."
    );
    return;
  }

  setTabError(
    isTlsFailure
      ? "That proxy route could not complete the site's secure connection. Trying another route..."
      : message || "The proxy server stopped responding. Trying another one..."
  );

  if (!target || !viewframe || attempts.size >= 6) return;
  if (recoveryPromise) return recoveryPromise;

  console.warn(
    `[cherri] proxy route ${wispUrl || "unknown"} failed for ${target}; trying another route`
  );

  recoveryPromise = ensureTransport(true, {
    exclude: [...attempts],
  })
    .then((nextUrl) => {
      attempts.add(nextUrl);
      recoveryAttempts.set(target, attempts);

      const currentTab = bTabs.find((tab) => tab.id === aTab);
      if (currentTab && currentTab.url === target) {
        // The new transport is ready. Reload only this failed tab, not the
        // whole cherri page, so other tabs and their sessions stay intact.
        viewframe.src = encodeForBackend(target);
      }
    })
    .catch((error) => {
      console.error("[cherri] could not find another proxy route:", error);
      setTabError(
        "No working proxy route was found. Try Settings -> Browser -> Wisp Server."
      );
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

  go(encodeForBackend(u));
}

function f() {
  const cTab = bTabs.find((t) => t.id === aTab);
  if (!cTab || cTab.historyIndex + 1 >= cTab.history.length) return;

  cTab.historyIndex++;
  const u = cTab.history[cTab.historyIndex];
  cTab.url = u;

  go(encodeForBackend(u));
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
  await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);

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