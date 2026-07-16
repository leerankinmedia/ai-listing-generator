import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

const PROTECTED_PREFIXES = ["/dashboard"]

/** Public auth / billing routes — never force a login redirect. */
const PUBLIC_AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/pricing",
  "/billing",
  "/checkout",
]

const EBAY_OAUTH_CALLBACK = "/api/marketplaces/ebay/oauth/callback"
const EBAY_OAUTH_START = "/api/marketplaces/ebay/oauth/start"

function paramNamesOf(request: NextRequest): string[] {
  return Array.from(request.nextUrl.searchParams.keys())
}

function logEbayOAuthEntry(
  request: NextRequest,
  extra?: Record<string, unknown>
) {
  const { pathname, search } = request.nextUrl
  const rawUrl = request.url
  const rawQueryIndex = rawUrl.indexOf("?")
  const rawQuery = rawQueryIndex >= 0 ? rawUrl.slice(rawQueryIndex + 1) : ""
  // Param names only from raw query — never log values (code is secret).
  const rawParamNames = rawQuery
    ? Array.from(new URLSearchParams(rawQuery.split("#")[0]).keys())
    : []

  console.info("[ebay/oauth] middleware entry", {
    host: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    pathname,
    searchLength: search.length,
    nextUrlParamNames: paramNamesOf(request),
    rawUrlParamNames: rawParamNames,
    rawUrlHasQuery: rawQueryIndex >= 0,
    redirected: false,
    ...extra,
  })
}

/**
 * Redirect helper that always preserves the incoming query string.
 */
function redirectPreservingQuery(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  const originalSearch = request.nextUrl.search
  url.pathname = pathname
  // clone() keeps search; re-assert in case pathname assignment clears it in some runtimes
  if (originalSearch && url.search !== originalSearch) {
    url.search = originalSearch
  }
  const destination = `${url.pathname}${url.search}`
  console.info("[ebay/oauth] middleware redirect", {
    from: `${request.nextUrl.pathname}${request.nextUrl.search}`,
    to: destination,
    queryPreserved: url.search === originalSearch,
    paramNames: paramNamesOf(request),
    redirected: true,
  })
  return NextResponse.redirect(url)
}

/**
 * Preview-first: signed-in users can explore the dashboard without a trial.
 * Paid actions are always locked by API guards + PaidFeatureGate unless
 * subscription status is trialing or active. BILLING_ENFORCEMENT does not
 * gate those paid features (it only reserves account-wide redirect behavior).
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Temporary safe diagnostics for the eBay OAuth round-trip.
  if (pathname === EBAY_OAUTH_CALLBACK || pathname === EBAY_OAUTH_START) {
    logEbayOAuthEntry(request)
  }

  // eBay OAuth return mistakenly pointed at Site URL (/): has code + expires_in.
  // Must NOT send this to Supabase /auth/callback (that consumes/strips the code).
  // Forward to the eBay callback WITH the full query string preserved.
  if (
    pathname === "/" &&
    searchParams.has("code") &&
    searchParams.has("expires_in")
  ) {
    logEbayOAuthEntry(request, { reason: "ebay_oauth_on_site_root" })
    return redirectPreservingQuery(request, EBAY_OAUTH_CALLBACK)
  }

  // Supabase recovery / magic-link on Site URL (/).
  // Do not treat eBay returns (code + expires_in) as Supabase auth codes.
  if (
    pathname === "/" &&
    (searchParams.has("token_hash") ||
      (searchParams.has("code") && !searchParams.has("expires_in")))
  ) {
    const url = request.nextUrl.clone()
    const originalSearch = request.nextUrl.search
    url.pathname = "/auth/callback"
    if (originalSearch && url.search !== originalSearch) {
      url.search = originalSearch
    }
    if (!url.searchParams.get("next")) {
      url.searchParams.set("next", "/reset-password")
    }
    console.info("[auth] middleware site-url → auth/callback", {
      paramNames: paramNamesOf(request),
      queryPreserved: url.search.includes(
        originalSearch.replace(/^\?/, "") || "no-query"
      ),
      redirected: true,
      destination: `${url.pathname}${url.search}`,
    })
    return NextResponse.redirect(url)
  }

  // eBay OAuth callback/start: never host-canonicalize here — pass through.
  // (Host bouncing previously risked dropping ?code=&state=.)
  if (pathname === EBAY_OAUTH_CALLBACK || pathname === EBAY_OAUTH_START) {
    return updateSession(request)
  }

  const response = await updateSession(request)

  const isPublicAuth = PUBLIC_AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )
  if (isPublicAuth) {
    return response
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  )

  if (!isProtected) {
    return response
  }

  // Auth requirement for /dashboard is handled by page-level client checks.
  // Do not hard-redirect for missing subscriptions (preview-first trial flow).
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
