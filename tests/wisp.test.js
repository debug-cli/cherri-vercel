"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../assets/js/wisp.js"),
  "utf8"
);

function createWispHarness() {
  const values = new Map();
  const sockets = [];
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
    }

    close() {
      this.readyState = 3;
    }
  }

  const window = { localStorage };
  const context = {
    window,
    URL,
    Set,
    Date,
    Promise,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options && options.detail;
      }
    },
    WebSocket: FakeWebSocket,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(source, context, { filename: "assets/js/wisp.js" });

  return { wisp: window.CherriWisp, values, sockets };
}

test("normalizes_wisp_urls", () => {
  const { wisp } = createWispHarness();

  assert.equal(
    wisp.normalizeWispUrl(" https://example.test/wisp#fragment "),
    "wss://example.test/wisp/"
  );
  assert.equal(wisp.normalizeWispUrl("localhost:8080"), "wss://localhost:8080/");
  assert.equal(wisp.normalizeWispUrl("ftp://example.test/"), null);
});

test("candidate_list_keeps_configured_first_and_excludes_normalized_duplicates", () => {
  const { wisp, values } = createWispHarness();
  values.set(wisp.KEYS.active, "wss://custom.example/wisp");

  const candidates = wisp.candidateList({
    exclude: ["wss://phantom.lol/wisp"],
  });

  assert.equal(candidates[0], "wss://custom.example/wisp/");
  assert.equal(candidates.includes("wss://phantom.lol/wisp/"), false);
  assert.equal(new Set(candidates).size, candidates.length);
});

test("probe_waits_for_first_packet", async () => {
  const { wisp, sockets } = createWispHarness();
  let settled = false;
  const result = wisp
    .probeWispServer("wss://wisp.example/", { timeoutMs: 100 })
    .then((value) => {
      settled = true;
      return value;
    });

  const socket = sockets[0];
  socket.readyState = 1; // WebSocket open without a Wisp packet is not healthy.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  socket.onmessage({ data: new Uint8Array([1]) });
  assert.equal((await result).ok, true);
  assert.equal(socket.readyState, 3);
});

test("probe_reports_socket_error", async () => {
  const { wisp, sockets } = createWispHarness();
  const resultPromise = wisp.probeWispServer("wss://wisp.example/");

  sockets[0].onerror(new Error("socket failed"));

  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(result.reason, "socket-error");
  assert.equal(sockets[0].readyState, 3);
});

test("probe_reports_response_timeout", async () => {
  const { wisp, sockets } = createWispHarness();
  const resultPromise = wisp.probeWispServer("wss://wisp.example/", {
    timeoutMs: 1,
  });
  sockets[0].readyState = 1;

  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout-response");
  assert.equal(sockets[0].readyState, 3);
});
