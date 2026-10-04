"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../assets/js/browserfunctions.js"),
  "utf8"
);
const goStart = source.indexOf("async function go(");
const goEnd = source.indexOf("function setTabError(", goStart);
const goSource = source.slice(goStart, goEnd);

function createHarness() {
  const calls = [];
  const titles = new Map([[1, "First"], [2, "Second"]]);
  const titleNodes = new Map([
    [1, { textContent: "First" }],
    [2, { textContent: "Second" }],
  ]);
  const frames = new Map([
    [1, { dataset: { frameId: "1" }, contentDocument: {}, style: {} }],
    [2, { dataset: { frameId: "2" }, contentDocument: {}, style: {} }],
  ]);
  const tabs = new Map([
    [1, { dataset: { tabId: "1" }, querySelector: () => titleNodes.get(1) }],
    [2, { dataset: { tabId: "2" }, querySelector: () => titleNodes.get(2) }],
  ]);
  const favorites = new Map([[1, {}], [2, {}]]);
  const searchbar = { value: "active tab's current value" };
  const document = {
    querySelector(selector) {
      let match = selector.match(/data-frame-id="(\d+)"/);
      if (match) return frames.get(Number(match[1]));
      match = selector.match(/data-tab-id="(\d+)"/);
      if (match) return tabs.get(Number(match[1]));
      match = selector.match(/data-fav-id="(\d+)"/);
      if (match) return favorites.get(Number(match[1]));
      return null;
    },
    getElementById(id) {
      return id === "searchbar" ? searchbar : null;
    },
  };

  const context = vm.createContext({
    URL,
    Promise,
    document,
    calls,
    titles,
    titleNodes,
    frames,
    searchbar,
    favorites,
  });
  vm.runInContext(
    `
      var aTab = 1;
      var bTabs = [
        { id: 1, url: "https://first.example/", history: [], historyIndex: -1 },
        { id: 2, url: "https://second.example/", history: [], historyIndex: -1 },
      ];
      var serviceWorkerReady = Promise.resolve();
      var ensureTransport = async () => "wss://phantom.lol/wisp/";
      var initScramjetController = async () => ({});
      var isUltravioletBackend = () => false;
      var scramjetFrameFor = async (tabId) => ({ go: (target) => calls.push({ kind: "navigate", tabId, target }) });
      var setTabError = (message, tabId) => calls.push({ kind: "error", message, tabId });
      var recoveryAttempts = new Map();
      var GraipWisp = { describeError: String };
      var updateUrlFromIframe = (frame, tabId) => calls.push({ kind: "url-update", tabId });
      ${goSource}
      globalThis.testGo = go;
      globalThis.testState = { calls, titleNodes, frames, searchbar, favorites };
    `,
    context,
    { filename: "browserfunctions-tab-navigation-test.js" }
  );
  return context;
}

test("navigation_and_load_callbacks_update_the_requested_tab_not_the_active_tab", async () => {
  const context = createHarness();
  const state = context.testState;

  await context.testGo("https://second.example/", 2);
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls)), [
    { kind: "navigate", tabId: 2, target: "https://second.example/" },
  ]);
  assert.equal(state.titleNodes.get(1).textContent, "First");
  assert.equal(state.titleNodes.get(2).textContent, "Loading...");
  assert.equal(state.searchbar.value, "active tab's current value");

  const frame = state.frames.get(2);
  frame.contentDocument = {
    documentElement: { dataset: {} },
    title: "Second Site",
    getElementById: () => null,
  };
  frame.onload();

  assert.equal(state.titleNodes.get(1).textContent, "First");
  assert.equal(state.titleNodes.get(2).textContent, "Second Site");
  assert.equal(state.calls.at(-1).kind, "url-update");
  assert.equal(state.calls.at(-1).tabId, 2);
});
