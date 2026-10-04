# Curl 60 Wisp and Scramjet Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine why Stellar.gdn and other destinations fail with libcurl error 60, add reliable regression coverage and truthful diagnostics, then apply only the remediation supported by route and certificate evidence.

**Architecture:** Keep Wisp reachability checks distinct from HTTPS destination TLS verification. Add deterministic tests for the existing Wisp probe and one shared client/service-worker error classifier; compare the current Wisp routes against valid and intentionally invalid TLS controls before choosing a correction. Do not change TLS verification settings to make a failing request pass.

**Tech Stack:** Existing vanilla JavaScript, Scramjet service worker, vendored libcurl.js 0.7.1 WASM bundle (Mbed TLS), Node.js built-in test runner (no new package dependency).

**Spec:** User request in this conversation (no separate spec file supplied): investigate `Request failed with error code 60: SSL peer certificate or SSH remote key was not OK` affecting `stellar.gdn` and other domains; plan tests for the current Wisp server and Scramjet changes; identify fixable causes and multiple safe remediations.

## Global Constraints

- Treat `CURLE_PEER_FAILED_VERIFICATION (60)` as a peer-certificate/fingerprint verification failure, not proof that the destination's certificate itself is defective.
- Preserve certificate and hostname verification in every route, fallback, and regression test; never ship an accept-all-certificate or `CURLOPT_SSL_VERIFYPEER=0` workaround.
- A successful Wisp handshake proves only that the Wisp endpoint answered; it does not prove that an HTTPS destination or its subresources can complete TLS.
- Do not add logging of request bodies, headers, cookies, or complete destination URLs containing paths, query strings, or fragments.
- The repository has no package manifest or existing automated test harness; use Node's built-in `node:test` without installing dependencies.

## Review Focus

- Valid destination certificates rejected on every route due to an embedded/outdated CA bundle: `test-valid-tls-control` plus the multi-route diagnostic matrix.
- Expired, self-signed, and hostname-mismatched peers accidentally accepted by a proposed workaround: `test-invalid-tls-controls-remain-rejected` on every tested route.
- A Wisp WebSocket handshake succeeds but the destination request fails: `test-wisp-handshake-is-not-destination-health` and the live matrix.
- A destination redirect, CDN/subresource, or WebSocket uses a different host/certificate from the top-level page: `test-redirect-and-subresource-hosts` in the browser matrix.
- Scramjet's generated 500 page is mistaken for a destination's ordinary 500, or vice versa: `test-scramjet-proxy-error-vs-origin-500`.

---

## Evidence and Initial Diagnosis

- Official [libcurl error-code documentation](https://curl.se/libcurl/c/libcurl-errors.html) defines code 60 as `CURLE_PEER_FAILED_VERIFICATION`: the remote peer's certificate or SSH fingerprint was not accepted. It explicitly recommends the error buffer for more specific detail; the numeric code alone does not name the cause.
- [libcurl.js documentation](https://libcurl.js.org/) describes TLS as running in client-side WebAssembly using Mbed TLS; Wisp forwards the encrypted TCP stream. In this architecture Wisp is not the HTTPS certificate verifier, although a different Wisp exit or network path can change DNS/routing or expose interception and therefore change the peer observed by libcurl.
- The checked-in `libcurl/index.mjs` identifies its libcurl.js bundle as 0.7.1 and its Wisp protocol code as 1.1.1. This makes the bundle's embedded CA data and upstream provenance worth checking if known-good hosts fail broadly; it does not by itself establish a stale-CA bug.
- The existing Wisp probe in `assets/js/wisp.js` waits for a Wisp packet, while `assets/js/browserfunctions.js` and `sw.js` classify code 60 as a destination-certificate rejection and do not retry it. That copy is more certain than the available evidence supports. The same code is the only reported detail so far, so the current Stellar.gdn root cause is **not yet confirmed**.
- **Fixability:** yes, depending on the branch found. A defective site chain can be repaired by its operator; a stale/incorrect libcurl.js trust bundle can be updated; a route-specific interception/egress problem can be avoided with a confirmed-good route; and a Scramjet URL/SNI issue can be fixed in the request path. If an unowned site intentionally serves a certificate that cannot be validated, Graip must keep rejecting it and explain why rather than bypass TLS.

## Files and Responsibilities

- Create `tests/wisp.test.js`: deterministic Node tests for URL normalization, candidate exclusion, and the Wisp handshake probe using a fake WebSocket.
- Create `assets/js/proxy-errors.js`: shared, dependency-free error classification and user-message logic consumed by both page and service worker.
- Create `tests/proxy-errors.test.js`: unit tests for error-code classification, actionable copy, and route retry policy.
- Create `tests/scramjet-errors.test.js`: service-worker integration tests for proxy failures versus genuine origin HTTP 500 responses.
- Modify `index.html`: load the shared error helper before `assets/js/browserfunctions.js`.
- Modify `assets/js/browserfunctions.js`: use shared classification and avoid claiming code 60 proves the destination certificate is invalid.
- Modify `sw.js`: import the shared helper and render consistent, non-overconfident proxy error pages.
- Conditional generated-bundle change only if evidence requires it: update `libcurl/index.mjs` and `libcurl/libcurl.mjs` together from a pinned, reproducible upstream/source build; do not hand-edit embedded WASM or patch only one generated bundle.

## Task 1: Lock Down the Existing Wisp Health Probe

**Files:**
- Create: `tests/wisp.test.js`
- Read: `assets/js/wisp.js`

**Interfaces:**
- Consumes: `window.GraipWisp.normalizeWispUrl(raw)`, `candidateList({ exclude })`, and `probeWispServer(url, { timeoutMs })`.
- Produces: tests run with `node --test tests/wisp.test.js`; no runtime API change.

- [x] **Step 1: Add deterministic tests** named `normalizes_wisp_urls`, `candidate_list_keeps_configured_first_and_excludes_normalized_duplicates`, `probe_waits_for_first_packet`, `probe_reports_socket_error`, and `probe_reports_response_timeout`. Load the existing IIFE in a Node `vm` context with fake `localStorage`, `URL`, timers, and a fake WebSocket whose open/message/error/close events are controlled by each test.
- [x] **Step 2: Run the tests against the current implementation.**

Run: `node --test tests/wisp.test.js`
Expected: PASS for the currently documented normalization, ordering/exclusion, and first-packet handshake behavior; failure output identifies any mismatch before product changes.

- [x] **Step 3: Correct only probe defects exposed by those tests** in `assets/js/wisp.js`; retain the contract that a WebSocket `open` alone is not a successful Wisp handshake. No probe behavior defect was exposed, so no behavior change was needed.
- [x] **Step 4: Re-run the focused suite.**

Run: `node --test tests/wisp.test.js`
Expected: all five tests PASS; timeouts settle once and close the fake socket.

## Task 2: Run the Wisp-to-Destination Differential Matrix (Root-Cause Gate)

**Files:**
- Test manually: current Graip proxy UI, Settings → Proxy → Wisp, `assets/js/wisp.js`, `assets/js/browserfunctions.js`, and `sw.js`.
- Record findings in the implementation review/PR; do not record full URLs, request contents, or credentials.

**Interfaces:**
- Consumes: the existing current-server handshake check and the Task 1 automated Wisp tests.
- Produces: one evidence-based diagnosis branch: destination/chain, bundle trust, route/egress, or Scramjet request transformation; do not begin a branch until its distinguishing result is observed.

- [x] **Step 1: Record the baseline.** Captured the configured route (`wisp.mercurywork.shop`), tested the deployed Graip browser and bundled libcurl/WASM runtime, and saved sanitized host/code/status results only; no request paths, credentials, headers, or cookies were recorded.
- [x] **Step 2: Test every configured Wisp preset for handshake only.** Probed all 29 current preset endpoints in the deployed browser, using a 2-second per-endpoint timeout and small concurrent batches; recorded online/unreachable, reason, and latency. Phantom and Mercury answered reliably, along with selected other provider endpoints; most presets were unavailable or timed out. A successful handshake is not a destination compatibility result.
- [x] **Step 3: Test destination TLS through the active route and two reachable routes from different preset operators.** In the deployed Graip page, requested `stellar.gdn` and `example.com` directly through libcurl on Mercury, Phantom, Definitely Science (two endpoints), Lichology, Anura, and Terbium. Phantom returned HTTP 200 for both. `example.com` returned HTTP 200 and Stellar consistently failed with curl 35 on Mercury, Definitely Science, Lichology, and curl 60 on Anura/Terbium during the expanded run. This is route-dependent at the time of testing; the prior isolated Mercury attempt once succeeded, so endpoint behavior is intermittent.
- [x] **Step 4: Exercise certificate-negative controls** at `https://expired.badssl.com/`, `https://self-signed.badssl.com/`, and `https://wrong.host.badssl.com/` (only if reachable on the current network). All three returned curl 60 on Mercury and Phantom. Certificate verification was not changed.
- [ ] **Step 5: Exercise different request shapes.** Covered: Stellar's top-level navigation and its CDN hero image loaded through Phantom in the deployed browser; the image host also returned HTTP 200 in a direct libcurl request, and `example.com` succeeded through the tested routes. Not completed: cross-host redirect, browser back/reload, TLS WebSocket destination. Do not extrapolate from the successful top-level/subresource checks.
- [x] **Step 6: Apply the diagnosis gate.** Live tests show route-dependent curl 35 and curl 60 for Stellar, while Phantom succeeds and invalid-certificate controls remain rejected. Permit at most one alternate route for code 60, with certificate verification retained; do not modify CA material. The historical root cause remains unconfirmed.
  - If the ordinary browser and all Wisp routes reject the same site's chain, confirm the destination chain/hostname/validity with a trusted certificate inspection. Repair it only if the Graip operator controls that site; otherwise retain strict rejection.
  - If valid controls fail with code 60 across multiple independent Wisp routes while ordinary-browser TLS succeeds, inspect the embedded CA bundle and libcurl.js provenance/version before changing endpoints.
  - If only one Wisp route produces code 60 while the same destination succeeds on other routes, investigate that route's egress, DNS, or interception; prefer removing/deprioritizing the proven-bad route. A single alternate-route retry is permitted only while certificate verification remains on and negative certificate controls continue to fail.
  - If direct libcurl requests through the same Wisp route work but Scramjet navigations/subresources fail, compare the exact host/authority and TLS SNI passed to `LibcurlClient` and inspect Scramjet URL rewriting/configuration.
  - If results vary only by request hostname, include redirect, CDN, API, and WebSocket host certificates in the diagnosis; do not assume the top-level Stellar certificate caused every code 60.

**Observed live evidence (2026-10-03):** Wisp handshakes worked for several endpoints. Through Phantom, `example.com` and `stellar.gdn` returned HTTP 200; expired, self-signed, and hostname-mismatched BadSSL controls all returned curl 60. `example.com` returned HTTP 200 through all tested routes. Stellar produced different failures across endpoints: curl 35 on Mercury/Definitely Science/Lichology, curl 60 on Anura/Terbium, and HTTP 200 on Phantom; Mercury succeeded on one earlier request. This points to route-specific or time-varying peer/handshake behavior rather than a general CA bundle failure. Negative controls continued to fail verification. The historical user-reported curl 60 is **not established as one particular root cause**: no redirect/subresource cause was isolated. The implementation now tries at most one alternate route for code 60, retains peer verification, and keeps code 35/7 route retry bounded at six. If a reproducible curl-60 case is captured, use its exact failing hostname to distinguish a destination-chain defect from exit-side interception/path behavior.

**Release gate:** Do not change trust policy or call the historical code-60 issue fully diagnosed from the current data. The one-route curl-60 fallback is bounded and preserves peer verification; do not treat success on one exit as proof that every affected host is healthy. Phantom served Stellar successfully and every intentionally invalid certificate control still failed verification. Other endpoints produced route-dependent curl 35/60, but the exact failing peer certificate and historical trigger remain unknown. Continue investigation if the error reproduces with a failing hostname and peer/route combination.

## Task 3: Centralize Error Classification and Correct Scramjet Diagnostics

**Files:**
- Create: `assets/js/proxy-errors.js`
- Create: `tests/proxy-errors.test.js`
- Create: `tests/scramjet-errors.test.js`
- Modify: `index.html`
- Modify: `pages/browser.html`, `pages/browser-minimum.html`, and `pages/embed.html` (standalone entry points load the same controller code)
- Modify: `assets/js/browserfunctions.js`
- Modify: `sw.js`

**Interfaces:**
- Produces global `GraipProxyErrors.classify(error) -> { kind, code, message }`, where `kind` is exactly `"peer-verification" | "tls-handshake" | "connectivity" | "runtime" | "other"`, `code` is a number or `null`, and `message` is the original error text or its string form.
- Produces `GraipProxyErrors.userMessage(classification) -> string`, `GraipProxyErrors.shouldRetryRoute(classification) -> boolean`, and `GraipProxyErrors.maxRouteAttempts(classification) -> number` (2 for peer-verification, 6 for TLS-handshake/connectivity, 0 otherwise).
- Consumes the same global in the page and service worker. `index.html` loads it before `browserfunctions.js`; `sw.js` calls `importScripts("/assets/js/proxy-errors.js")` before registering the fetch listener.

- [x] **Step 1: Write failing classifier tests** for code 60, code 35, code 7, WASM-load failure, and an unknown error. Assert code 60 is described as a **TLS peer verification failure with multiple possible causes**, not as proof that the destination certificate is bad. Assert code 60 may retry once on a different route and the existing bounded retries for code 35 and code 7 remain enabled; every request must continue validating the peer. Cover ordinary destination HTTP 500 separately in the service-worker integration tests below.
- [x] **Step 2: Verify the classifier tests fail before implementation.**

Run: `node --test tests/proxy-errors.test.js`
Expected: FAIL because `GraipProxyErrors` does not exist yet.

- [x] **Step 3: Implement `classify`, `userMessage`, `shouldRetryRoute`, and `maxRouteAttempts`** in `assets/js/proxy-errors.js`. Parse the curl code once; use neutral code-60 copy that mentions destination chain/hostname, trust bundle/runtime, clock, or route/network interception as possibilities. Keep TLS verification enabled and bound code 60 to one alternate route.
- [x] **Step 4: Run classifier tests.**

Run: `node --test tests/proxy-errors.test.js`
Expected: PASS; code 60 remains a peer verification failure, allows at most one alternate-route attempt, and retains certificate verification; code 35/7 retain the current six-attempt bound.

- [x] **Step 5: Write service-worker regression tests** named `scramjet_code_60_returns_neutral_proxy_error_page`, `scramjet_proxy_500_is_converted`, `origin_500_is_preserved`, and `non_navigation_proxy_error_is_502_text`. Load `sw.js` in a Node `vm` harness with mocked `importScripts`, `$scramjetController`, `self.addEventListener`, requests, and responses. Assert the code-60 page does not claim the destination certificate is definitively defective, and ordinary origin 500 responses remain untouched.
- [x] **Step 6: Verify the service-worker tests fail before the integration changes.**

Run: `node --test tests/scramjet-errors.test.js`
Expected: the neutral code-60 assertion fails against the current copy; origin-500 preservation passes and remains required throughout.

- [x] **Step 7: Load the shared helper and replace duplicate page/service-worker regex and copy** with `GraipProxyErrors.classify`, `userMessage`, `shouldRetryRoute`, and `maxRouteAttempts`. Preserve the six-attempt route cap for code 35/7 and permit only one alternate route for code 60; each retried request still runs normal certificate verification.
- [x] **Step 8: Run all deterministic tests.**

Run: `node --test tests/*.test.js`
Expected: all Wisp, classifier, and service-worker tests PASS; no third-party test packages are installed.

## Task 4: Apply Only the Evidence-Selected Remediation

**Files:** Choose only the branch established in Task 2. Potential code paths are `assets/js/wisp.js`, `assets/js/browserfunctions.js`, `sw.js`, `assets/js/proxy-errors.js`, and (only for a confirmed bundle-trust defect) the paired generated files `libcurl/index.mjs` and `libcurl/libcurl.mjs`.

**Interfaces:**
- Consumes: Task 2's route/destination evidence and Task 3's classifier/test contracts.
- Produces: one cause-specific fix with tests; if evidence remains ambiguous, produce no TLS/route behavior change beyond accurate diagnostics.

- [x] **Step 1: For a destination-chain defect,** the destination is not controlled by Graip and no destination-chain defect was established, so no certificate was changed; strict validation remains in place. The negative controls remained rejected, and Stellar succeeded only on Phantom in the captured live matrix.
- [x] **Step 2: For a confirmed embedded-CA/runtime defect,** none was confirmed: `example.com` succeeded on tested routes and all three invalid-certificate controls returned curl 60. No CA bundle or generated WASM files were changed.
- [x] **Step 3: For observed route-dependent failures,** keep all existing routes but retry curl 60 at most once on a different configured Wisp endpoint. Each new request still uses libcurl's normal certificate and hostname verification. Automated tests prove the failed route is excluded and retries stop after the single alternate; live negative controls still returned curl 60. Phantom fetched Stellar, while several other handshaking routes returned curl 35 or 60. This is a safe bounded recovery for the observed differential, not proof of the underlying route mechanism.
- [x] **Step 4: For a confirmed Scramjet-only host/SNI transformation defect,** no transformation defect was established: the deployed Scramjet page and CDN image loaded via Phantom, and direct libcurl also fetched the image. No Scramjet URL/SNI or bundle changes were justified.
- [x] **Step 5: Re-run all automated tests and the successful/negative live matrix for the selected branch.** Automated tests and syntax checks pass locally; the successful/negative route evidence is recorded in Task 2. The historical error remains unreproduced on the successful Phantom route.

Run: `node --test tests/*.test.js`
Expected: PASS. Live acceptance: the originally failing valid host/request succeeds via the corrected path; invalid peers still fail verification; other route-error handling remains unchanged.

## Task 5: Browser Regression and Rollout Acceptance

**Files:** Test manually in the Graip browser UI and DevTools; inspect `index.html`, `assets/js/browserfunctions.js`, and `sw.js` behavior.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified UI and service-worker behavior on the supported user flows, with root cause and route matrix recorded.

- [x] **Step 1: Smoke-test normal operation** with one selected Wisp route: loaded Stellar through Phantom in the Graip Scramjet frame and verified its title and CDN-hosted hero image; separately requested the image via libcurl and got HTTP 200. Ordinary origin HTTP-500 and redirect behavior remain covered in unit tests only, not a live page flow.
- [ ] **Step 2: Smoke-test failure handling** on the deployed browser by selecting an unreachable Wisp server, then loading a valid HTTPS site; confirm code 7 recovery and the six-attempt cap. Verify code 35 behavior and inject code 60 to confirm neutral peer-verification copy, at most one alternate route, and continued rejection of invalid controls. The code-60 path is covered in `tests/browser-recovery.test.js`, but live/local route-error injection was not completed; the local static server used by this run returned 404 for Scramjet paths because it does not implement the deployment's rewrites.
- [ ] **Step 3: Smoke-test tab lifecycle** using back, forward, reload, multiple tabs, and changing Wisp server in settings; confirm a route recovery reloads only the affected tab and does not lose unrelated tabs. During local testing the standalone browser page successfully created and switched tabs; live proxy navigation could not be validated against the static server, whose Scramjet rewrite returned 404. The tab-id regression is covered by `tests/browser-tab-navigation.test.js` and concurrent error recovery by `tests/browser-recovery.test.js`, but back/forward/reload and full browser-level recovery isolation still require manual follow-up.
- [x] **Step 4: Run `node --test tests/*.test.js` and complete a final route/destination matrix** after the selected fix. Final suite: 15 tests passed; the earlier live matrix is summarized under Task 2. The incomplete live UI scenarios are explicitly retained above.

Run: `node --test tests/*.test.js`
Expected: all automated tests PASS; browser checks show valid endpoints working, invalid certificate controls rejected, and accurate diagnostics for the observed failure.

## Validation Notes

- No package manager, build command, or automated browser-test framework is present in the repository. The repo README documents serving the files with `python3 -m http.server`; use that only for manual browser acceptance, not as a substitute for tests.
- The `agent-browser` CLI was initially missing; its documented `core` skill was loaded via `npx --yes agent-browser skills get core`, then Chrome was installed with `npx --yes agent-browser install`. An isolated deployed session previously verified Stellar and a CDN asset on Phantom. In this continuation, a temporary localhost static server loaded the edited app/helper and standalone browser UI; tab creation and switching worked, but proxied URLs returned 404 because Python's static server does not implement the deployment's Scramjet route rewrites. The local browser run therefore does not count as live proxy/recovery acceptance. Full redirect, failure recovery, browser history, and origin-500 UI flows remain incomplete.
- Do not treat the present error text alone as the underlying TLS error buffer. The vendored wrapper formats code plus libcurl's generic error string; a more specific error buffer can be added only if the upstream build exposes it safely and reproducibly.
