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
const waitStart = source.indexOf("function waitForServiceWorkerControl()");
const waitEnd = source.indexOf("/** Wisp endpoint", waitStart);
const initStart = source.indexOf("function initScramjetController()");
const initEnd = source.indexOf("async function scramjetFrameFor", initStart);
const initSource = source.slice(waitStart, waitEnd) + source.slice(initStart, initEnd);

function createHarness(initialController = null) {
  const listeners = new Map();
  const activeWorker = { label: "active but not controlling" };
  const controllerOptions = [];
  const serviceWorker = {
    controller: initialController,
    ready: Promise.resolve(),
    async register() {
      return { active: activeWorker };
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const context = vm.createContext({
    Promise,
    navigator: { serviceWorker },
    setTimeout,
    clearTimeout,
    SCRAMJET_CONFIG: {},
    CherriWisp: { getConfiguredUrl: () => "wss://wisp.example/" },
    createTransport: async (url) => ({ url }),
    $scramjetController: {
      Controller: function (options) {
        controllerOptions.push(options);
        return { wait: async () => {} };
      },
    },
  });

  vm.runInContext(
    `
      let scramjetControllerPromise = null;
      let scramjetController = null;
      ${initSource}
      globalThis.initController = initScramjetController;
    `,
    context,
    { filename: "browserfunctions-service-worker-control-test.js" }
  );

  return { context, serviceWorker, listeners, activeWorker, controllerOptions };
}

test("scramjet_waits_for_page_control_instead_of_using_an_active_registration", async () => {
  const harness = createHarness();
  const navigation = harness.context.initController();

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.controllerOptions.length, 0);
  assert.equal(harness.listeners.has("controllerchange"), true);

  const controllingWorker = { label: "controls this page" };
  harness.serviceWorker.controller = controllingWorker;
  harness.listeners.get("controllerchange")();
  await navigation;

  assert.equal(harness.controllerOptions.length, 1);
  assert.equal(harness.controllerOptions[0].serviceworker, controllingWorker);
  assert.notEqual(harness.controllerOptions[0].serviceworker, harness.activeWorker);
  assert.equal(harness.listeners.has("controllerchange"), false);
});

test("scramjet_reuses_a_worker_that_already_controls_the_page", async () => {
  const controllingWorker = { label: "already controls this page" };
  const harness = createHarness(controllingWorker);

  await harness.context.initController();

  assert.equal(harness.controllerOptions.length, 1);
  assert.equal(harness.controllerOptions[0].serviceworker, controllingWorker);
  assert.equal(harness.listeners.has("controllerchange"), false);
});
