/**
 * cherri wisp helper
 *
 * Every proxied request goes through the libcurl transport, which tunnels all
 * traffic over a single wisp WebSocket server. When that server is unreachable
 * libcurl aborts the socket and rejects with:
 *
 *   TypeError: Request failed with error code 7: Could not connect to server
 *
 * (curl error 7 == CURLE_COULDNT_CONNECT, thrown from the transport's request()).
 *
 * This module owns everything about picking a wisp server that actually answers, so
 * callers never hand libcurl a dead endpoint:
 *
 *   - normalizes/validates whatever is in localStorage (libcurl throws a hard
 *     TypeError on a URL without a trailing slash or a non-ws:// scheme)
 *   - health checks a server with a real wisp handshake (the connection only counts
 *     as usable once the server sends its first packet, which is exactly what
 *     libcurl's WispConnection waits for)
 *   - fails over to the next server in the pool automatically and remembers the
 *     winner, so a dead default no longer bricks the whole browser
 */
(function (global) {
  "use strict";

  /**
   * Fallback pool, tried in order when the configured server does not answer.
   *
   * Order matters: this is the order servers get probed in. Phantom and Mercury
   * are preferred fallbacks, while public endpoints can go offline or become
   * blocked without notice. The rest stay available as last-resort choices.
   */
  const PRESETS = [
    { id: "Phantom", name: "Phantom", url: "wss://phantom.lol/wisp/" },
    {
      id: "Mercury",
      name: "Mercury",
      url: "wss://wisp.mercurywork.shop/",
    },

    { id: "rhw", name: "RHW", url: "wss://wisp.rhw.one/" },

    { id: "Alu 1", name: "Alu 1", url: "wss://aluu.xyz/wisp/" },
    { id: "Alu 2", name: "Alu 2", url: "wss://freemathhw.xyz/wisp/" },
    { id: "Alu 3", name: "Alu 3", url: "wss://canvaslogin.org/wisp/" },
    { id: "Alu 4", name: "Alu 4", url: "wss://tnlnda.xyz/wisp/" },

    {
      id: "Incognito 1",
      name: "Incognito 1",
      url: "wss://incog.works/wisp/",
    },
    {
      id: "Incognito 2",
      name: "Incognito 2",
      url: "wss://math.mathpuns.lol/wisp/",
    },
    {
      id: "Incognito 3",
      name: "Incognito 3",
      url: "wss://math.americahistory.online/wisp/",
    },
    {
      id: "Incognito 4",
      name: "Incognito 4",
      url: "wss://english.geniuslecture.club/wisp/",
    },

    {
      id: "Definitely Science 1",
      name: "Definitely Science 1",
      url: "wss://definitelyscience.com/wisp/",
    },
    {
      id: "Definitely Science 2",
      name: "Definitely Science 2",
      url: "wss://onlinegames.ro/wisp/",
    },
    {
      id: "Definitely Science 3",
      name: "Definitely Science 3",
      url: "wss://mages.io/wisp/",
    },
    {
      id: "Definitely Science 4",
      name: "Definitely Science 4",
      url: "wss://lichology.com/wisp/",
    },

    { id: "Anura 1", name: "Anura 1", url: "wss://anura.pro/" },
    { id: "Anura 2", name: "Anura 2", url: "wss://adoptmy.baby/" },
    { id: "Anura 3", name: "Anura 3", url: "wss://wallstjournal.click/" },
    { id: "Anura 4", name: "Anura 4", url: "wss://mexicoon.top/" },
    { id: "Anura 5", name: "Anura 5", url: "wss://onlineosdev.nl/" },
    { id: "Anura 6", name: "Anura 6", url: "wss://swordartii.online/" },

    {
      id: "Terbium 1",
      name: "Terbium 1",
      url: "wss://wisp.terbiumon.top/wisp/",
    },
    {
      id: "Terbium 2",
      name: "Terbium 2",
      url: "wss://quantumchemistry.club/wisp/",
    },
    {
      id: "Terbium 3",
      name: "Terbium 3",
      url: "wss://explorechemistry.online/wisp/",
    },
    { id: "Terbium 4", name: "Terbium 4", url: "wss://webmath.help/wisp/" },

    { id: "Radius 1", name: "Radius 1", url: "wss://radiusproxy.app/wisp/" },
    {
      id: "Radius 1 (Adblock)",
      name: "Radius 1 (Adblock)",
      url: "wss://radiusproxy.app/adblock/",
    },
    { id: "Radius 2", name: "Radius 2", url: "wss://radiusowski.site/wisp/" },
    {
      id: "Radius 2 (Adblock)",
      name: "Radius 2 (Adblock)",
      url: "wss://radiusowski.site/adblock/",
    },
  ];

  const KEYS = {
    /** Active endpoint. Always a validated ws(s) URL ending in "/". */
    active: "cherri_wispUrl",
    /** Preset id chosen from the settings dropdown. */
    preset: "cherri_wispUrlSelected",
    /** Last endpoint typed in by hand, kept so it can be retried later. */
    custom: "cherri_wispUrlCustom",
    /** Timestamp of the last successful handshake. */
    verifiedAt: "cherri_wispUrlVerifiedAt",
  };

  const DEFAULT_URL = PRESETS[0].url;

  function storage() {
    try {
      return global.localStorage;
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
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch (error) {
      /* private mode / quota — the in-memory cache still covers this session */
    }
  }

  /**
   * Turn whatever the user (or an older version of cherri) stored into a URL that
   * libcurl will accept: ws:// or wss:// scheme, trailing slash, nothing else.
   *
   * Anything that parses as a URL is returned, including a bare word (treated as
   * a hostname, so "ws://localhost:8080" keeps working) — being wrong here only
   * costs a failed probe, while rejecting a valid endpoint breaks the proxy.
   *
   * @param {string} raw
   * @returns {string|null} normalized URL, or null when it cannot be parsed
   */
  function normalizeWispUrl(raw) {
    if (typeof raw !== "string") return null;

    let value = raw.trim();
    if (!value) return null;

    if (value.startsWith("//")) {
      value = "wss:" + value;
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = "wss://" + value;
    }

    value = value.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");

    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      return null;
    }

    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") return null;
    if (!parsed.hostname) return null;

    if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
    // wisp endpoints have no business carrying a fragment
    parsed.hash = "";

    return parsed.toString();
  }

  function presetForUrl(url) {
    return PRESETS.find((preset) => preset.url === url) || null;
  }

  function presetForId(id) {
    return PRESETS.find((preset) => preset.id === id) || null;
  }

  /**
   * Resolve the endpoint the user asked for, without trusting that it is usable.
   * The active URL wins (that is what failover persists); a hand typed custom URL
   * and the dropdown preset are fallbacks for anyone whose localStorage was only
   * half populated by an older build.
   *
   * @returns {string} a normalized URL, always safe to hand to libcurl
   */
  function getConfiguredUrl() {
    const active = normalizeWispUrl(read(KEYS.active));
    if (active) return active;

    const custom = normalizeWispUrl(read(KEYS.custom));
    if (custom) return custom;

    const preset = presetForId(read(KEYS.preset));
    if (preset) return preset.url;

    return DEFAULT_URL;
  }

  /**
   * Ordered, de-duplicated list of endpoints to try.
   *
   * `exclude` is used after a destination request fails. A Wisp handshake can
   * succeed while one exit server is unable to complete a particular site's TLS
   * handshake, so retrying the same endpoint would just repeat the same error.
   *
   * @param {{ exclude?: string[] }} [options]
   */
  function candidateList(options) {
    const excluded = new Set(
      (options && Array.isArray(options.exclude) ? options.exclude : [])
        .map(normalizeWispUrl)
        .filter(Boolean)
    );
    const seen = new Set();
    const list = [];

    const add = (value) => {
      const url = normalizeWispUrl(value);
      if (url && !excluded.has(url) && !seen.has(url)) {
        seen.add(url);
        list.push(url);
      }
    };

    add(getConfiguredUrl());
    add(read(KEYS.custom));
    PRESETS.forEach((preset) => add(preset.url));

    return list;
  }

  /**
   * Check that a server really speaks wisp. libcurl only considers its tunnel open
   * once the server sends the first packet, so "the WebSocket opened" is not enough
   * — an endpoint that accepts the upgrade and then sits there still produces curl
   * error 7 later on.
   *
   * Always resolves; never throws, so it is safe to race a whole pool of servers.
   *
   * @param {string} url
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ok:boolean,url:string,ms:number,reason?:string,detail?:string}>}
   */
  function probeWispServer(url, options) {
    const timeoutMs = (options && options.timeoutMs) || 4000;
    const started = Date.now();

    return new Promise((resolve) => {
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        resolve({
          ok: false,
          url,
          ms: 0,
          reason: "invalid-url",
          detail: (error && error.message) || String(error),
        });
        return;
      }

      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
        } catch (error) {
          /* ignore */
        }
        try {
          if (socket.readyState === 0 || socket.readyState === 1) socket.close();
        } catch (error) {
          /* ignore */
        }
        resolve(Object.assign({ url, ms: Date.now() - started }, result));
      };

      const timer = setTimeout(() => {
        // CONNECTING -> we never even got a socket; OPEN -> it is not a wisp server
        finish({
          ok: false,
          reason: socket.readyState === 0 ? "timeout-connect" : "timeout-response",
        });
      }, timeoutMs);

      try {
        socket.binaryType = "arraybuffer";
      } catch (error) {
        /* older browsers only support "blob"; either is fine here */
      }

      socket.onmessage = () => finish({ ok: true });
      socket.onerror = () => finish({ ok: false, reason: "socket-error" });
      socket.onclose = (event) =>
        finish({
          ok: false,
          reason: "closed",
          detail: event && event.code ? String(event.code) : "",
        });
    });
  }

  /**
   * Probe a list of servers concurrently and hand back the first one that answers.
   *
   * @param {string[]} urls
   * @param {{ concurrency?: number, timeoutMs?: number, maxWaitMs?: number, onStatus?: Function }} [options]
   * @returns {Promise<{ok:boolean,url:string,ms:number}|null>}
   */
  function probePool(urls, options) {
    const opts = options || {};
    const concurrency = Math.max(1, Math.min(opts.concurrency || 4, urls.length || 1));
    let cursor = 0;
    let found = false;

    const worker = async () => {
      while (!found && cursor < urls.length) {
        const url = urls[cursor++];
        if (opts.onStatus) opts.onStatus({ phase: "testing", url });
        const result = await probeWispServer(url, { timeoutMs: opts.timeoutMs });
        if (result.ok) {
          found = true;
          return result;
        }
        if (opts.onStatus) opts.onStatus({ phase: "failed", result });
      }
      return null;
    };

    return new Promise((resolve) => {
      let settled = false;
      let remaining = concurrency;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        found = true; // stop the other workers picking up new urls
        clearTimeout(giveUp);
        resolve(value);
      };

      // a pool where nothing answers should still report back quickly
      const giveUp = setTimeout(() => finish(null), opts.maxWaitMs || 20000);

      for (let i = 0; i < concurrency; i++) {
        worker().then(
          (result) => {
            if (result) {
              finish(result);
              return;
            }
            remaining--;
            if (remaining === 0) finish(null);
          },
          () => {
            remaining--;
            if (remaining === 0) finish(null);
          }
        );
      }
    });
  }

  /** Per-tab cache so repeated navigations do not re-probe everything. */
  const state = { verified: null, inflight: null };

  /**
   * Remember a server the user picked by hand (settings page).
   *
   * @param {string} url
   * @param {{ custom?: boolean }} [options]
   * @returns {string|null} the normalized URL, or null when it was unusable
   */
  function setActiveServer(url, options) {
    const normalized = normalizeWispUrl(url);
    if (!normalized) return null;

    write(KEYS.active, normalized);
    if (options && options.custom) write(KEYS.custom, normalized);

    const preset = presetForUrl(normalized);
    if (preset) write(KEYS.preset, preset.id);

    // a hand picked server has not been proven yet
    state.verified = null;
    return normalized;
  }

  /**
   * Hand back an endpoint that has been proven reachable, failing over through the
   * pool when the configured one is dead.
   *
   * @param {{ force?: boolean, timeoutMs?: number, concurrency?: number, maxWaitMs?: number, exclude?: string[], onStatus?: Function }} [options]
   * @returns {Promise<{ok:boolean,url:string,ms:number}|null>}
   */
  function getWorkingWispServer(options) {
    const opts = options || {};
    const excluded = new Set(
      (Array.isArray(opts.exclude) ? opts.exclude : [])
        .map(normalizeWispUrl)
        .filter(Boolean)
    );

    if (
      state.verified &&
      !opts.force &&
      !excluded.has(normalizeWispUrl(state.verified.url))
    ) {
      return Promise.resolve(state.verified);
    }
    if (state.inflight && !opts.force && excluded.size === 0) {
      return state.inflight;
    }

    state.inflight = (async () => {
      const candidates = candidateList({ exclude: [...excluded] });
      if (!candidates.length) return null;

      const result = await probePool(candidates, {
        concurrency: opts.concurrency,
        timeoutMs: opts.timeoutMs,
        maxWaitMs: opts.maxWaitMs,
        onStatus: opts.onStatus,
      });

      if (result) {
        write(KEYS.active, result.url);
        write(KEYS.verifiedAt, String(Date.now()));
        const preset = presetForUrl(result.url);
        if (preset) write(KEYS.preset, preset.id);
        state.verified = result;
      } else {
        state.verified = null;
      }

      return result;
    })();

    const inflight = state.inflight;
    inflight.then(() => {
      if (state.inflight === inflight) state.inflight = null;
    });

    return inflight;
  }

  /** Forget the cached server so the next call probes from scratch. */
  function resetCache() {
    state.verified = null;
    state.inflight = null;
  }

  /**
   * Point the transport at a wisp server that answers.
   *
   * @param {{ setTransport: (url: string) => Promise<void> }} target whatever owns the transport
   * @param {{ force?: boolean, timeoutMs?: number, concurrency?: number, maxWaitMs?: number, exclude?: string[], onStatus?: Function }} [options]
   * @returns {Promise<string>} the endpoint now in use
   */
  async function configureTransport(target, options) {
    const opts = options || {};
    if (!target || typeof target.setTransport !== "function") {
      throw new Error("No transport target was given to configureTransport().");
    }

    const server = await getWorkingWispServer(opts);
    if (!server) {
      const error = new Error(
        "No wisp server could be reached. Every proxy request will fail until a " +
          "working server is set in Settings -> Browser."
      );
      error.code = "NO_WISP_SERVER";
      error.attempted = candidateList(opts);
      throw error;
    }

    await target.setTransport(server.url);
    return server.url;
  }

  /** libcurl error number from one of its rejection messages, when present. */
  function curlCode(error) {
    const message = (error && (error.message || String(error))) || "";
    const match = message.match(/error code (-?\d+)/);
    return match ? Number(match[1]) : null;
  }

  /**
   * Turn a transport failure into something a person can act on.
   *
   * @param {unknown} error
   * @returns {string}
   */
  function describeError(error) {
    const message = (error && (error.message || String(error))) || "Unknown proxy error";

    if (/wasm not loaded|load_wasm|failed to load wasm/i.test(message)) {
      return "The proxy's libcurl WebAssembly runtime did not load. Reload the page and try again.";
    }

    if (curlCode(error) === 7 || /could not connect to server/i.test(message)) {
      return (
        "cherri could not reach its proxy server (" +
        getConfiguredUrl() +
        "). The server is either down or blocked on this network. cherri will keep " +
        "trying the other servers on the list."
      );
    }

    if (/no bare clients|no BareTransport was set/i.test(message)) {
      return "The proxy transport never started. Reload the page to try again.";
    }

    if (error && error.code === "NO_WISP_SERVER") {
      return (
        "None of the proxy servers on the list could be reached. Open Settings -> " +
        "Browser and set a wisp server that works on your network."
      );
    }

    return message;
  }

  global.CherriWisp = {
    PRESETS,
    KEYS,
    DEFAULT_URL,
    normalizeWispUrl,
    getConfiguredUrl,
    candidateList,
    presetForUrl,
    presetForId,
    probeWispServer,
    probePool,
    setActiveServer,
    getWorkingWispServer,
    configureTransport,
    resetCache,
    curlCode,
    describeError,
  };
})(typeof window !== "undefined" ? window : globalThis);
