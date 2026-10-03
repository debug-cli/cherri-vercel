# Agent Notes

## Proxy architecture and debugging

- Main Scramjet, standalone browser, mini-browser, and embed pages load the page-side controller independently; shared browser helpers must be included in each HTML entry point, not just `index.html`. Ultraviolet has a separate worker and should not import Scramjet-specific error helpers.
- Curl 60 comes from vendored libcurl.js (TLS verification inside WASM); Wisp handshake health does not establish destination TLS health. Error 60 alone does not identify whether the endpoint chain, local CA trust, or route path caused verification failure.
- `libcurl/index.mjs` and `libcurl/libcurl.mjs` are generated package bundles that should be updated together from a reproducible upstream build; do not hand-edit the embedded WASM trust material or disable TLS verification.

## Tests

- There is no root package manifest or pre-existing test runner; use dependency-free tests with `node --test tests/*.test.js`.
- `sw.js` is a worker and depends on imported Scramjet globals; isolated Node tests need a VM harness that mocks `importScripts`, `self.addEventListener`, and the controller.
- Scramjet request-failure feedback is routed through `handleProxyFailure()` from the proxied frame's `onload` marker; therefore the page controller performs route recovery. The service worker only renders/classifies the failure response. Code-60 retry limits belong in the page-side recovery path, with SW copy kept consistent.
- Browser-side Wisp probes can establish endpoint handshake health, and direct `LibcurlClient.request()` calls in an isolated deployed browser can compare destination TLS by route; neither substitutes for Scramjet frame/navigation testing.
