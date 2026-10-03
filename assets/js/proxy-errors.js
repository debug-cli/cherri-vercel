(function (global) {
  "use strict";

  function errorMessage(error) {
    if (error && typeof error === "object" && error.message) {
      return String(error.message);
    }
    return error == null ? "Unknown proxy error" : String(error);
  }

  function classify(error) {
    const message = errorMessage(error);
    const codeMatch = message.match(/error code\s+(-?\d+)/i);
    const code = codeMatch ? Number(codeMatch[1]) : null;

    if (
      code === 60 ||
      /peer certificate|certificate.*(?:invalid|expired|not ok)|cert.*verify/i.test(
        message
      )
    ) {
      return { kind: "peer-verification", code: code === null ? 60 : code, message };
    }

    if (
      code === 35 ||
      /ssl connect error|tls handshake|tls connection/i.test(message)
    ) {
      return { kind: "tls-handshake", code, message };
    }

    if (code === 7 || /could not connect to server/i.test(message)) {
      return { kind: "connectivity", code: code === null ? 7 : code, message };
    }

    if (/wasm not loaded|load_wasm|failed to load wasm/i.test(message)) {
      return { kind: "runtime", code, message };
    }

    return { kind: "other", code, message };
  }

  function userMessage(classification) {
    switch (classification && classification.kind) {
      case "peer-verification":
        return (
          "libcurl TLS peer verification failed (curl 60). Possible causes include " +
          "the destination's certificate chain or hostname, the client's trust " +
          "bundle or clock, or route/network interception. Certificate checks remain " +
          "enabled; compare with a known-good site and check another route only to " +
          "diagnose route-specific behavior."
        );
      case "tls-handshake":
        return "The selected proxy route could not complete the site's TLS handshake. A different Wisp route may work.";
      case "connectivity":
        return "The proxy route could not connect. The Wisp server may be unavailable or blocked on this network.";
      case "runtime":
        return "The proxy's libcurl WebAssembly runtime did not load. Reload the page and try again.";
      default:
        return (classification && classification.message) || "Unknown proxy error";
    }
  }

  function shouldRetryRoute(classification) {
    return Boolean(
      classification &&
        (classification.kind === "peer-verification" ||
          classification.kind === "tls-handshake" ||
          classification.kind === "connectivity")
    );
  }

  function maxRouteAttempts(classification) {
    if (!shouldRetryRoute(classification)) return 0;
    return classification.kind === "peer-verification" ? 2 : 6;
  }

  global.CherriProxyErrors = {
    classify,
    userMessage,
    shouldRetryRoute,
    maxRouteAttempts,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
