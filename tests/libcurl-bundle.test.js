"use strict";

/**
 * The proxy's TLS behaviour lives inside the vendored libcurl bundle: the
 * WebAssembly payload carries curl, Mbed TLS, nghttp2 and the CA certificate
 * store. "SSL error on this one site" reports are usually a stale trust store or
 * a curl/Mbed TLS bug that upstream already fixed, so these tests pin the exact
 * upstream artifacts we ship and the one patch we add on top of them.
 *
 * They fail loudly if somebody hand-edits the bundle, downgrades it, or
 * accidentally drops the load-wait patch while regenerating it.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

/** libcurl.js 0.7.5 `libcurl.wasm`, which libcurl-transport 2.0.6 bundles. */
const EXPECTED_WASM_SHA256 =
  "6a7d769e903e65d93d0f6103fd4632a11368d3ab1868aa3d0abcef47a117030a";

const BUNDLES = ["libcurl/index.mjs", "libcurl/index.js", "libcurl/index.cjs"];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function embeddedWasm(file) {
  const match = read(file).match(
    /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/
  );
  assert.ok(match, `${file} no longer embeds its WebAssembly payload`);
  return Buffer.from(match[1], "base64");
}

test("vendored libcurl bundles carry the upstream 0.7.5 runtime", () => {
  for (const file of BUNDLES) {
    const source = read(file);
    assert.match(
      source,
      /libcurl_version = "0\.7\.5"/,
      `${file} is not the 0.7.5 runtime`
    );
    assert.match(
      source,
      /@mercuryworkshop\/libcurl-transport@2\.0\.6/,
      `${file} lost its provenance banner`
    );
  }
});

test("embedded WASM matches upstream libcurl.js 0.7.5 byte for byte", () => {
  for (const file of BUNDLES) {
    const digest = crypto
      .createHash("sha256")
      .update(embeddedWasm(file))
      .digest("hex");

    assert.equal(
      digest,
      EXPECTED_WASM_SHA256,
      `${file} embeds a modified or different libcurl WASM build; ` +
        "regenerate from npm instead of editing the trust store by hand"
    );
  }
});

test("embedded WASM still compiles", async () => {
  const module = await WebAssembly.compile(embeddedWasm("libcurl/index.mjs"));
  assert.ok(WebAssembly.Module.imports(module).length > 0);
});

test("the load-wait patch is present in every bundle", () => {
  for (const file of BUNDLES) {
    const source = read(file);

    assert.match(
      source,
      /if \(!libcurl\.ready\)/,
      `${file} no longer waits for the WASM runtime before creating HTTPSession`
    );
    assert.match(
      source,
      /wasm not loaded/,
      `${file} lost the error text the page-side helpers classify as a runtime failure`
    );
    assert.match(
      source,
      /libcurl WASM runtime did not finish loading/,
      `${file} lost the timeout that turns a broken WASM build into a real error ` +
        "instead of a tab that loads forever"
    );
    assert.match(
      source,
      /libcurl_abort/,
      `${file} must reject instead of hanging when Emscripten aborts the load`
    );
    assert.match(source, /clearTimeout\(timer\)/, `${file} leaks its timer`);
  }
});

test("the Scramjet entry point re-exports the same bundle", () => {
  const entry = read("libcurl/libcurl.mjs");

  assert.match(entry, /export \{ default \} from "\.\/index\.mjs"/);
  assert.match(entry, /export \* from "\.\/index\.mjs"/);
});

test("the ESM bundle exports the transport class as the default export", () => {
  const source = read("libcurl/index.mjs");

  assert.match(source, /export \{[\s\S]*LibcurlClient as default[\s\S]*\};/);
  // both option names are accepted; the page passes { wisp }
  assert.match(source, /this\.wisp = options\.wisp \?\? options\.websocket;/);
});
