if (navigator.userAgent.includes("Firefox")) {
	Object.defineProperty(globalThis, "crossOriginIsolated", {
		value: true,
		writable: false,
	});
}

// s16 asked me to credit swium, so here you go. happy now?

// Scramjet's service worker half. Proxied requests are routed back to the page
// that owns the frame, and the cookie jar lives with that page too, so nothing
// proxy related is kept in here.
importScripts("/assets/js/proxy-errors.js", "/homework/chemistry.sw.js");

const CONFIG = {
	blocked: [
		"youtube.com/get_video_info?*adformat=*",
		"youtube.com/api/stats/ads/*",
		"youtube.com/pagead/*",
		".facebook.com/ads/*",
		".facebook.com/tr/*",
		".fbcdn.net/ads/*",
		"graph.facebook.com/ads/*",
		"ads-api.twitter.com/*",
		"analytics.twitter.com/*",
		".twitter.com/i/ads/*",
		".ads.yahoo.com",
		".advertising.com",
		".adtechus.com",
		".oath.com",
		".verizonmedia.com",
		".amazon-adsystem.com",
		"aax.amazon-adsystem.com/*",
		"c.amazon-adsystem.com/*",
		".adnxs.com",
		".adnxs-simple.com",
		"ab.adnxs.com/*",
		".rubiconproject.com",
		".magnite.com",
		".pubmatic.com",
		"ads.pubmatic.com/*",
		".criteo.com",
		"bidder.criteo.com/*",
		"static.criteo.net/*",
		".openx.net",
		".openx.com",
		".indexexchange.com",
		".casalemedia.com",
		".adcolony.com",
		".chartboost.com",
		".unityads.unity3d.com",
		".inmobiweb.com",
		".tapjoy.com",
		".applovin.com",
		".vungle.com",
		".ironsrc.com",
		".fyber.com",
		".smaato.net",
		".supersoniads.com",
		".startappservice.com",
		".airpush.com",
		".outbrain.com",
		".taboola.com",
		".revcontent.com",
		".zedo.com",
		".mgid.com",
		"*/ads/*",
		"*/adserver/*",
		"*/adclick/*",
		"*/banner_ads/*",
		"*/sponsored/*",
		"*/promotions/*",
		"*/tracking/ads/*",
		"*/promo/*",
		"*/affiliates/*",
		"*/partnerads/*",
	],
};

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function toRegex(pattern) {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "{{DOUBLE_STAR}}")
		.replace(/\*/g, "[^/]*")
		.replace(/{{DOUBLE_STAR}}/g, ".*");
	return new RegExp(`^${escaped}$`);
}

/**
 * @param {string} hostname
 * @param {string} pathname
 * @returns {boolean}
 */
function isBlocked(hostname, pathname) {
	return CONFIG.blocked.some((pattern) => {
		if (pattern.startsWith("#")) {
			pattern = pattern.substring(1);
		}
		if (pattern.startsWith("*")) {
			pattern = pattern.substring(1);
		}

		if (pattern.includes("/")) {
			const [hostPattern, ...pathParts] = pattern.split("/");
			const pathPattern = pathParts.join("/");
			const hostRegex = toRegex(hostPattern);
			const pathRegex = toRegex(`/${pathPattern}`);
			return hostRegex.test(hostname) && pathRegex.test(pathname);
		}
		const hostRegex = toRegex(pattern);
		return hostRegex.test(hostname);
	});
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Pull the real site out of a proxied url like
 * "/scramjet/https%3A%2F%2Ftiktok.com%2F" so the error page can name it.
 *
 * @param {string} requestUrl
 * @returns {string}
 */
function proxiedTarget(requestUrl) {
	let path;

	try {
		path = decodeURIComponent(new URL(requestUrl).pathname.replace(/^\/+/, ""));
	} catch (error) {
		path = new URL(requestUrl).pathname;
	}

	const scheme = path.match(/(^|\/)[a-z][a-z0-9+.-]*:\/\//i);

	return scheme ? path.slice(scheme.index + scheme[1].length) : path;
}

/**
 * The ad list is checked here rather than in the page, so a blocked request never
 * has to travel through the frame and back.
 *
 * @param {string} requestUrl
 * @returns {URL|null} the blocked destination, when there is one
 */
function blockedTarget(requestUrl) {
	const target = proxiedTarget(requestUrl).split("#")[0];

	try {
		const parsed = new URL(target);
		return isBlocked(parsed.hostname, parsed.pathname) ? parsed : null;
	} catch (error) {
		return null;
	}
}

/**
 * libcurl rejects with "Request failed with error code 7: Could not connect to
 * server" when its wisp endpoint is down or blocked. Left alone that rejection
 * kills the service worker response and the tab just sits there blank, so render
 * something that says what actually happened.
 *
 * @param {FetchEvent} event
 * @param {unknown} error
 * @returns {Response}
 */
function transportErrorPage(event, error) {
	const message = (error && error.message) || String(error);
	const classification = CherriProxyErrors.classify(error);
	const userMessage = escapeHtml(CherriProxyErrors.userMessage(classification));
	const isPeerVerificationFailure = classification.kind === "peer-verification";
	const isTlsFailure = classification.kind === "tls-handshake";
	const isWasmFailure = classification.kind === "runtime";
	const accept = event.request.headers.get("accept") || "";
	const isNavigation =
		event.request.mode === "navigate" || accept.includes("text/html");

	if (!isNavigation) {
		return new Response(`Proxy request failed: ${message}`, {
			status: 502,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}

	const target = proxiedTarget(event.request.url);

	const html = `<!DOCTYPE html>
<html lang="en" data-cherri-proxy-error="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>cherri | proxy error</title>
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0d0d10;
		color: #e8e8ea;
		font-family: Inter, system-ui, -apple-system, sans-serif;
		padding: 24px;
		box-sizing: border-box;
	}
	.card {
		width: 100%;
		max-width: 560px;
		background: #16161b;
		border: 1px solid #2a2a33;
		border-radius: 14px;
		padding: 28px;
	}
	h1 { margin: 0 0 8px; font-size: 20px; }
	p { margin: 0 0 14px; color: #a7a7b1; font-size: 14px; line-height: 1.6; }
	code {
		display: block;
		background: #0d0d10;
		border: 1px solid #2a2a33;
		border-radius: 8px;
		padding: 10px 12px;
		font-size: 12px;
		word-break: break-all;
		color: #ff9f9f;
		margin-bottom: 14px;
	}
	b { color: #e8e8ea; }
	.row { display: flex; gap: 10px; flex-wrap: wrap; }
	button, a {
		appearance: none;
		border: 1px solid #3a3a45;
		background: #202027;
		color: #e8e8ea;
		border-radius: 10px;
		padding: 10px 16px;
		font-size: 13px;
		font-family: inherit;
		text-decoration: none;
		cursor: pointer;
	}
	button:hover, a:hover { background: #2a2a33; }
</style>
</head>
<body>
	<div class="card">
		<h1>${isWasmFailure
			? "The proxy runtime failed to start"
			: isPeerVerificationFailure
			? "The TLS peer could not be verified"
			: isTlsFailure
			? "The site's secure connection failed"
			: "The proxy server could not be reached"}</h1>
		<p>${isWasmFailure
			? "The libcurl WebAssembly runtime did not finish loading. Reload the page; this is a proxy startup problem, not a problem with the destination site."
			: isTlsFailure
			? "The selected proxy route could not finish the site's TLS handshake. A different Wisp route may work."
			: isPeerVerificationFailure
			? `${userMessage} Try another Wisp route. Cherri retries once on a different route and keeps certificate verification enabled.`
			: "cherri tunnels every page through a Wisp server, and that server did not answer. It may be offline or blocked on this network."}</p>
		<p>Requested: <b>${escapeHtml(target)}</b></p>
		<code id="cherri-proxy-message">${escapeHtml(message)}</code>
			<p>${isWasmFailure
				? "Reload to retry the proxy runtime, or open Settings &rarr; Proxy &rarr; Wisp."
				: "Reload to try another route, or pick a different server under Settings &rarr; Proxy &rarr; Wisp."}
			Current server: <b id="server">unknown</b></p>
		<div class="row">
			<button onclick="location.reload()">Reload</button>
			<a href="/?launch=1" target="_top">Open Cherri</a>
		</div>
	</div>
	<script>
		try {
			var stored = localStorage.getItem("cherri_wispUrl");
			if (stored) document.getElementById("server").textContent = stored;
		} catch (e) {}
	</script>
</body>
</html>
`;

	return new Response(html, {
		status: 502,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

/**
 * Scramjet v1 renders transport and startup exceptions as its own status-500
 * HTML page instead of throwing them to this wrapper. Detect only recognizable
 * proxy messages, so an ordinary 500 returned by a destination is left untouched.
 *
 * @param {Response} response
 * @returns {Promise<string|null>}
 */
async function findTransportError(response) {
	if (!response || response.status < 500) return null;

	try {
		const text = await response.clone().text();
		const match = text.match(
			/Request failed with error code\s+\d+:\s*[^"<\\]+/i
		);
		if (match) return match[0].trim();

		// Scramjet can render initialization failures as a status-500 page too.
		// Keep this separate from destination 500 responses so the tab gets a
		// useful startup message instead of the full generated stack trace.
		if (/wasm not loaded|load_wasm|failed to load wasm/i.test(text)) {
			return "wasm not loaded yet, please call libcurl.load_wasm first";
		}

		return null;
	} catch (error) {
		return null;
	}
}

/**
 * @param {FetchEvent} event
 * @returns {Promise<Response>}
 */
async function handleRequest(event) {
	const blocked = blockedTarget(event.request.url);

	if (blocked) {
		return new Response("Site Blocked", {
			status: 403,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}

	if (!$scramjetController.shouldRoute(event)) {
		return fetch(event.request);
	}

	let response;

	try {
		response = await $scramjetController.route(event);
	} catch (error) {
		console.error("[cherri] proxy fetch failed:", error);
		return transportErrorPage(event, error);
	}

	const renderedTransportError = await findTransportError(response);
	if (renderedTransportError) {
		console.error("[cherri] proxy destination request failed:", renderedTransportError);
		return transportErrorPage(event, new Error(renderedTransportError));
	}

	return response;
}

self.addEventListener("fetch", (event) => {
	const url = event.request.url;

  	if (url.includes("supabase.co")) {
    	return;
  	}

	event.respondWith(handleRequest(event));
});


