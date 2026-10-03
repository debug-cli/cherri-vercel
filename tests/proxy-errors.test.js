"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../assets/js/proxy-errors.js"),
  "utf8"
);
const context = vm.createContext({});
vm.runInContext(source, context, { filename: "assets/js/proxy-errors.js" });
const errors = context.CherriProxyErrors;

test("classifies peer verification, tls, connectivity, runtime, and unknown errors", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(errors.classify(new Error("Request failed with error code 60: SSL peer certificate or SSH remote key was not OK")))),
    {
      kind: "peer-verification",
      code: 60,
      message:
        "Request failed with error code 60: SSL peer certificate or SSH remote key was not OK",
    }
  );
  assert.equal(errors.classify("Request failed with error code 35: SSL connect error").kind, "tls-handshake");
  assert.equal(errors.classify("Request failed with error code 7: Could not connect to server").kind, "connectivity");
  assert.equal(errors.classify("wasm not loaded yet").kind, "runtime");
  assert.equal(errors.classify("unexpected failure").kind, "other");
});

test("code 60 copy does not claim the destination certificate is definitely defective", () => {
  const classification = errors.classify(
    "Request failed with error code 60: SSL peer certificate or SSH remote key was not OK"
  );
  const message = errors.userMessage(classification).toLowerCase();

  assert.match(message, /peer verification failed/);
  assert.match(message, /possible causes/);
  assert.match(message, /certificate chain|hostname/);
  assert.match(message, /trust|runtime/);
  assert.doesNotMatch(message, /destination presented an invalid certificate/);
});

test("route retry policy is bounded and excludes unclassified failures", () => {
  const certificateFailure = errors.classify("error code 60");
  const tlsFailure = errors.classify("error code 35");
  const connectivityFailure = errors.classify("error code 7");
  const unknown = errors.classify("unclassified");

  assert.equal(errors.shouldRetryRoute(certificateFailure), true);
  assert.equal(errors.maxRouteAttempts(certificateFailure), 2);
  assert.equal(errors.shouldRetryRoute(tlsFailure), true);
  assert.equal(errors.maxRouteAttempts(tlsFailure), 6);
  assert.equal(errors.shouldRetryRoute(connectivityFailure), true);
  assert.equal(errors.maxRouteAttempts(connectivityFailure), 6);
  assert.equal(errors.shouldRetryRoute(unknown), false);
  assert.equal(errors.maxRouteAttempts(unknown), 0);
});
