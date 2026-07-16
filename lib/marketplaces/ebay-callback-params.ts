/**
 * Temporary helpers to inspect / recover eBay OAuth callback query params.
 * eBay authorization codes often contain `#` / `^`. If eBay (or a proxy) leaves
 * those unencoded, browsers treat `#` as the URL fragment and drop `state`
 * (and the rest of `code`) before the request reaches the server.
 */

export type EbayCallbackParamPresence = {
  paramNames: string[]
  codePresent: boolean
  statePresent: boolean
  errorPresent: boolean
  errorDescriptionPresent: boolean
  expiresInPresent: boolean
  codeLength: number
  stateLength: number
  /** True when the raw request URL contains `#` after `?` (fragment risk). */
  rawUrlHasHashAfterQuery: boolean
  host: string
  pathname: string
}

export function inspectEbayCallbackSearchParams(
  requestUrl: string,
  searchParams: URLSearchParams
): EbayCallbackParamPresence {
  let host = ""
  let pathname = ""
  let rawUrlHasHashAfterQuery = false
  try {
    const u = new URL(requestUrl)
    host = u.host
    pathname = u.pathname
    const q = requestUrl.indexOf("?")
    const h = requestUrl.indexOf("#")
    rawUrlHasHashAfterQuery = q >= 0 && h > q
  } catch {
    // ignore
  }

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const expiresIn = searchParams.get("expires_in")

  return {
    paramNames: Array.from(searchParams.keys()),
    codePresent: Boolean(code),
    statePresent: Boolean(state),
    errorPresent: Boolean(error),
    errorDescriptionPresent: Boolean(errorDescription),
    expiresInPresent: Boolean(expiresIn),
    codeLength: code?.length ?? 0,
    stateLength: state?.length ?? 0,
    rawUrlHasHashAfterQuery,
    host,
    pathname,
  }
}

export function logEbayCallbackParams(presence: EbayCallbackParamPresence) {
  console.info("[ebay/oauth] callback params (safe)", {
    host: presence.host,
    pathname: presence.pathname,
    paramNames: presence.paramNames,
    codePresent: presence.codePresent,
    statePresent: presence.statePresent,
    errorPresent: presence.errorPresent,
    errorDescriptionPresent: presence.errorDescriptionPresent,
    expiresInPresent: presence.expiresInPresent,
    codeLength: presence.codeLength,
    stateLength: presence.stateLength,
    rawUrlHasHashAfterQuery: presence.rawUrlHasHashAfterQuery,
    cookieExpected: "lw_oauth_state",
  })
}

/**
 * HTML bridge: recover code/state from the full browser href (including hash)
 * and bounce back to the API callback with properly encoded query params.
 * No secrets or full token values are shown.
 */
export function ebayCallbackBridgeHtml(apiCallbackPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Completing eBay connection…</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; background: #f6f3ee; color: #1c1917; }
    code { word-break: break-all; font-size: 12px; }
    .box { background: #fff; border-radius: 12px; padding: 16px; max-width: 40rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1 style="font-size:1.1rem;margin:0 0 8px">Completing eBay connection…</h1>
    <p id="status">Recovering OAuth parameters…</p>
    <pre id="debug" style="display:none;white-space:pre-wrap"></pre>
  </div>
  <script>
(function () {
  var API = ${JSON.stringify(apiCallbackPath)};
  var statusEl = document.getElementById("status");
  var debugEl = document.getElementById("debug");

  function parseHref(href) {
    var q = href.indexOf("?");
    if (q < 0) return { code: null, state: null, error: null, error_description: null, names: [] };
    var raw = href.slice(q + 1); // keep '#' inside query (browser fragment split)
    // Prefer normal URLSearchParams on search + hash-as-query
    var url = new URL(href);
    var params = new URLSearchParams(url.search);
    if (url.hash && url.hash.length > 1) {
      var hashBody = url.hash.slice(1);
      // Case A: hash is "&state=...&expires_in=..." continuation
      // Case B: hash is remainder of unencoded code then "&state=..."
      if (hashBody.indexOf("=") >= 0 || hashBody.charAt(0) === "&") {
        var hp = new URLSearchParams(hashBody.charAt(0) === "&" ? hashBody.slice(1) : hashBody);
        hp.forEach(function (v, k) {
          if (!params.has(k)) params.set(k, v);
        });
      }
      // If code was truncated at '#', rebuild from raw string
      if (params.get("code") && raw.indexOf("#") >= 0) {
        var codeStart = raw.indexOf("code=") + 5;
        var endMatch = raw.slice(codeStart).search(/&(state|expires_in|error|error_description)=/);
        var codeRaw = endMatch >= 0 ? raw.slice(codeStart, codeStart + endMatch) : raw.slice(codeStart);
        if (codeRaw && codeRaw.length > (params.get("code") || "").length) {
          params.set("code", codeRaw);
        }
        // Pull state from raw if missing
        if (!params.get("state")) {
          var sm = raw.match(/&(state)=([^&]*)/);
          if (sm) params.set("state", decodeURIComponent(sm[2]));
        }
      }
    }
    return {
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
      error_description: params.get("error_description"),
      names: Array.from(params.keys())
    };
  }

  var parsed = parseHref(window.location.href);
  var safe = {
    paramNames: parsed.names,
    codePresent: !!parsed.code,
    statePresent: !!parsed.state,
    errorPresent: !!parsed.error,
    errorDescriptionPresent: !!parsed.error_description,
    codeLength: parsed.code ? parsed.code.length : 0,
    stateLength: parsed.state ? parsed.state.length : 0
  };
  debugEl.style.display = "block";
  debugEl.textContent = JSON.stringify(safe, null, 2);

  if (parsed.error) {
    statusEl.textContent = "eBay returned an error. Redirecting…";
    var errUrl = new URL(API, window.location.origin);
    errUrl.searchParams.set("error", parsed.error);
    if (parsed.error_description) errUrl.searchParams.set("error_description", parsed.error_description);
    errUrl.searchParams.set("bridged", "1");
    window.location.replace(errUrl.toString());
    return;
  }

  if (!parsed.code) {
    statusEl.textContent = "No OAuth code found in the callback URL. Return to Connections and try again.";
    return;
  }

  statusEl.textContent = "Code recovered. Finishing connection…";
  var next = new URL(API, window.location.origin);
  next.searchParams.set("code", parsed.code);
  if (parsed.state) next.searchParams.set("state", parsed.state);
  next.searchParams.set("bridged", "1");
  window.location.replace(next.toString());
})();
  </script>
</body>
</html>`
}
