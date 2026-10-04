"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");

function createServiceWorkerHarness(route) {
  let fetchListener;
  const context = vm.createContext({
    URL,
    Response,
    Promise,
    Set,
    navigator: { userAgent: "node-test" },
    $scramjetController: {
      shouldRoute: () => true,
      route,
    },
    self: {
      addEventListener(type, listener) {
        if (type === "fetch") fetchListener = listener;
      },
    },
    console: { error() {} },
  });
  context.importScripts = (...scripts) => {
    for (const script of scripts) {
      if (script === "/assets/js/proxy-errors.js") {
        vm.runInContext(
          fs.readFileSync(path.join(__dirname, "../assets/js/proxy-errors.js"), "utf8"),
          context,
          { filename: script }
        );
      }
    }
  };
  vm.runInContext(source, context, { filename: "sw.js" });

  return async function request({ mode = "navigate", accept = "text/html" } = {}) {
    let responsePromise;
    const event = {
      request: {
        url: "https://graip.test/~/sj/https%3A%2F%2Fstellar.gdn%2F",
        mode,
        headers: { get: (name) => (name === "accept" ? accept : null) },
      },
      respondWith(value) {
        responsePromise = Promise.resolve(value);
      },
    };
    fetchListener(event);
    return responsePromise;
  };
}

test("scramjet_code_60_returns_neutral_proxy_error_page", async () => {
  const request = createServiceWorkerHarness(async () =>
    new Response(
      '<html><body>Request failed with error code 60: SSL peer certificate or SSH remote key was not OK</body></html>',
      { status: 500, headers: { "content-type": "text/html" } }
    )
  );
  const response = await request();
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, /TLS peer could not be verified/);
  assert.doesNotMatch(html, /The destination's certificate was rejected/);
  assert.doesNotMatch(html, /destination presented a certificate that failed validation/i);
  assert.match(html, /error code 60/);
  assert.match(html, /retries once on a different route/i);
  assert.match(html, /keeps certificate verification enabled/i);
});

test("scramjet_proxy_500_is_converted", async () => {
  const request = createServiceWorkerHarness(async () =>
    new Response(
      '<html><body>Request failed with error code 7: Could not connect to server</body></html>',
      { status: 500, headers: { "content-type": "text/html" } }
    )
  );
  const response = await request();
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, /proxy server could not be reached/i);
  assert.match(html, /error code 7/);
});

test("origin_500_is_preserved", async () => {
  const original = new Response("Origin server error", {
    status: 500,
    headers: { "content-type": "text/plain" },
  });
  const request = createServiceWorkerHarness(async () => original);

  const response = await request({ accept: "text/plain" });

  assert.equal(response.status, 500);
  assert.equal(await response.text(), "Origin server error");
});

test("non_navigation_proxy_error_is_502_text", async () => {
  const request = createServiceWorkerHarness(async () => {
    throw new Error("Request failed with error code 60: SSL peer certificate was not OK");
  });
  const response = await request({ mode: "cors", accept: "application/json" });

  assert.equal(response.status, 502);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(await response.text(), /error code 60/);
});
