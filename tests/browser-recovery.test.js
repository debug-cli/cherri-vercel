"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const browserSource = fs.readFileSync(
  path.join(__dirname, "../assets/js/browserfunctions.js"),
  "utf8"
);
const errorsSource = fs.readFileSync(
  path.join(__dirname, "../assets/js/proxy-errors.js"),
  "utf8"
);

function createHarness() {
  const sourceStart = browserSource.indexOf("async function handleProxyFailure(");
  const sourceEnd = browserSource.indexOf("function b()", sourceStart);
  const recoverySource = browserSource.slice(sourceStart, sourceEnd);
  const context = vm.createContext({
    URL,
    Promise,
    Set,
    Map,
    console: { warn() {}, error() {} },
  });

  vm.runInContext(errorsSource, context);
  vm.runInContext(
    `
      var aTab = 1;
      var bTabs = [
        { id: 1, url: "https://stellar.gdn/private/path?token=secret" },
        { id: 2, url: "https://example.com/other?secret=secret" },
      ];
      var wispUrl = "wss://bad-route.test/";
      var recoveryPromise = null;
      var recoveryAttempts = new Map();
      var calls = [];
      var logs = [];
      console.warn = function (message) { logs.push(message); };
      var frames = new Map([[1, { id: 1 }], [2, { id: 2 }]]);
      var document = { querySelector: (selector) => selector.includes('"2"') ? frames.get(2) : frames.get(1) };
      var GraipWisp = { describeError: String };
      var resolveTransport;
      var ensureTransport = function (_force, options) {
        calls.push({ kind: "transport", exclude: Array.from(options.exclude) });
        return new Promise((resolve) => { resolveTransport = resolve; });
      };
      var go = function (url, tabId) { calls.push({ kind: "go", url, tabId }); };
      var setTabError = function (message, tabId) { calls.push({ kind: "message", message, tabId }); };
      ${recoverySource}
      globalThis.callHandleProxyFailure = handleProxyFailure;
      globalThis.callRetryProxyRoute = retryProxyRoute;
      globalThis.resolveTransport = (url) => resolveTransport(url);
      globalThis.testState = { calls: calls, logs: logs, attempts: recoveryAttempts, frames: frames, tabs: bTabs };
    `,
    context,
    { filename: "browserfunctions-recovery-test.js" }
  );
  return context;
}

const curl60 =
  "Request failed with error code 60: SSL peer certificate or SSH remote key was not OK";

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("curl_60_tries_one_alternate_route_and_keeps_tls_validation_enabled", async () => {
  const context = createHarness();
  const state = context.testState;

  const retry = context.callHandleProxyFailure(curl60);
  await flushPromises();
  context.resolveTransport("wss://alternate-route.test/");
  await retry;
  await flushPromises();

  const calls = JSON.parse(JSON.stringify(state.calls));
  const logs = JSON.parse(JSON.stringify(state.logs));
  assert.equal(calls.filter(({ kind }) => kind === "transport").length, 1);
  assert.equal(calls.filter(({ kind }) => kind === "go").length, 1);
  assert.equal(calls.find(({ kind }) => kind === "go").url, state.tabs[0].url);
  assert.equal(calls.find(({ kind }) => kind === "go").tabId, 1);
  assert.deepEqual(calls.find(({ kind }) => kind === "transport").exclude, [
    "wss://bad-route.test/",
  ]);
  assert.equal(
    state.attempts.get(1).attempts.has("wss://alternate-route.test/"),
    true
  );
  assert.match(calls.find(({ kind }) => kind === "message").message, /certificate checks remain enabled/i);
  assert.doesNotMatch(
    JSON.stringify([
      ...calls.filter(({ kind }) => kind !== "go"),
      ...logs,
    ]),
    /token=secret|private\/path|other\?secret/
  );

  await context.callHandleProxyFailure(curl60);
  await flushPromises();
  assert.equal(
    JSON.parse(JSON.stringify(state.calls)).filter(({ kind }) => kind === "transport").length,
    1
  );
});

test("concurrent_code_60_failures_share_the_transport_retry_and_reload_both_affected_tabs", async () => {
  const context = createHarness();
  const state = context.testState;

  const first = context.callHandleProxyFailure(curl60, 1);
  await flushPromises();
  const second = context.callHandleProxyFailure(curl60, 2);
  context.resolveTransport("wss://alternate-route.test/");
  await Promise.all([first, second]);

  const calls = JSON.parse(JSON.stringify(state.calls));
  assert.equal(calls.filter(({ kind }) => kind === "transport").length, 1);
  assert.deepEqual(
    calls.filter(({ kind }) => kind === "go").map(({ tabId }) => tabId).sort(),
    [1, 2]
  );
  assert.equal(state.attempts.get(1).attempts.has("wss://alternate-route.test/"), true);
  assert.equal(state.attempts.get(2).attempts.has("wss://alternate-route.test/"), true);
});
