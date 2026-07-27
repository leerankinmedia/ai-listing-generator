import { NextRequest, NextResponse } from "next/server"
import { exchangeEbayCode } from "@/lib/marketplaces/adapters/ebay/oauth"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { PRODUCTION_APP_URL } from "@/lib/app-url"
import { getEntitlement } from "@/lib/billing/entitlement"
import { resolveIsPermanentOwner } from "@/lib/billing/owner-resolve"
import {
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE,
  readOAuthStateCookie,
  readOAuthStateCookieFromRequest,
  resolveAndAssertOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { saveConnection } from "@/lib/marketplaces/connections/store"
import { getServerAuthUser } from "@/lib/supabase/index"

/** Structured OAuth callback failure — always instanceof Error for the UI. */
export class EbayOAuthStepError extends Error {
  readonly step: string
  readonly details: Record<string, unknown>

  constructor(
    step: string,
    cause: unknown,
    details: Record<string, unknown> = {}
  ) {
    super(formatOAuthFailure(step, cause, details))
    this.name = "EbayOAuthStepError"
    this.step = step
    this.details = details
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

function formatUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    // Supabase PostgrestError: { message, code, details, hint }
    const parts = [o.message, o.code, o.details, o.hint]
      .filter((v) => v != null && String(v).trim() !== "")
      .map(String)
    if (parts.length) return parts.join(" | ")
    try {
      return JSON.stringify(err)
    } catch {
      return Object.prototype.toString.call(err)
    }
  }
  return String(err)
}

function formatOAuthFailure(
  step: string,
  cause: unknown,
  details: Record<string, unknown> = {}
): string {
  const detailBits = Object.entries(details)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
  return [
    `eBay OAuth failed`,
    `step=${step}`,
    `error=${formatUnknownError(cause)}`,
    ...detailBits,
  ].join(" | ")
}

/**
 * Read OAuth query params from nextUrl, falling back to the raw request URL.
 * Never log param values (authorization codes are secrets).
 */
function readCallbackParams(request: NextRequest) {
  const nextParams = request.nextUrl.searchParams
  const nextNames = Array.from(nextParams.keys())

  let rawNames: string[] = []
  let rawParams: URLSearchParams | null = null
  try {
    const raw = request.url
    const q = raw.indexOf("?")
    if (q >= 0) {
      // Server request URLs should not include fragments; still strip defensively.
      const query = raw.slice(q + 1).split("#")[0]
      rawParams = new URLSearchParams(query)
      rawNames = Array.from(rawParams.keys())
    }
  } catch {
    // ignore parse errors
  }

  // Prefer whichever source actually carries OAuth fields.
  const useRaw =
    (!nextParams.has("code") && !nextParams.has("error")) &&
    Boolean(rawParams && (rawParams.has("code") || rawParams.has("error")))

  const params = useRaw && rawParams ? rawParams : nextParams

  return {
    params,
    nextNames,
    rawNames,
    usedRawUrl: useRaw,
    searchLength: request.nextUrl.search.length,
  }
}

function postOAuthConnectionsUrl(
  status: "connected" | "error",
  message?: string
) {
  const url = new URL("/dashboard/connections", PRODUCTION_APP_URL)
  url.searchParams.set("ebay", status)
  // Allow longer diagnostic messages (step + PostgrestError fields).
  if (message) url.searchParams.set("message", message.slice(0, 700))
  console.info("[ebay/oauth] post-OAuth redirect", {
    location: url.toString(),
    status,
  })
  return url
}

function redirectWith(status: "connected" | "error", message?: string) {
  const response = NextResponse.redirect(postOAuthConnectionsUrl(status, message))
  clearOAuthStateCookie(response)
  return response
}

/**
 * Shared eBay authorization-code callback handler.
 * Used by /api/ebay/callback (Production RuName) and the legacy
 * /api/marketplaces/ebay/oauth/callback path — same token-storage flow.
 */
export async function handleEbayOAuthCallback(request: NextRequest) {
  const { params, nextNames, rawNames, usedRawUrl, searchLength } =
    readCallbackParams(request)

  console.info("[ebay/oauth] callback request", {
    flow: "oauth2_authorization_code",
    host: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    pathname: request.nextUrl.pathname,
    searchLength,
    nextUrlParamNames: nextNames,
    rawUrlParamNames: rawNames,
    usedRawUrl,
    codePresent: params.has("code"),
    statePresent: params.has("state"),
    errorPresent: params.has("error"),
    errorDescriptionPresent: params.has("error_description"),
    expiresInPresent: params.has("expires_in"),
    hasCookie: Boolean(
      readOAuthStateCookieFromRequest(request) ||
        (await readOAuthStateCookie())
    ),
    cookieName: OAUTH_STATE_COOKIE,
    // No canonical-host redirect on this route — Auth Accepted URL must already
    // be the production callback so ?code=&state= are never bounced/stripped.
    canonicalRedirect: false,
  })

  const user = await getServerAuthUser()
  if (!user?.id) {
    return redirectWith("error", "Sign in required to connect a marketplace.")
  }

  // Same entitlement path as Billing / OAuth start — Owner always completes connect.
  const ownerBypass = await resolveIsPermanentOwner(user)
  const entitlement = await getEntitlement(user.id, {
    email: user.email,
    authUser: user,
  })
  const isOwner =
    ownerBypass ||
    entitlement.ownerOverride === true ||
    entitlement.status === "owner"
  if (!isOwner && !entitlement.allowed) {
    return redirectWith(
      "error",
      entitlement.status === "expired"
        ? "Your free trial has expired. Subscribe on the Billing page to continue."
        : "Start your 7-day free trial to unlock this feature."
    )
  }

  const error = params.get("error")
  const errorDescription = params.get("error_description")
  if (error) {
    return redirectWith(
      "error",
      formatOAuthFailure("ebay_oauth_deny", errorDescription || error, {
        ebayError: error,
      })
    )
  }

  let code = params.get("code")
  const state = params.get("state")
  const paramNames = Array.from(params.keys())

  if (!code || !state) {
    return redirectWith(
      "error",
      formatOAuthFailure(
        "callback_params",
        !paramNames.length
          ? "OAuth callback reached ListWise without query parameters."
          : "Missing OAuth code or state from eBay.",
        {
          paramNames: paramNames.join(",") || "(none)",
          codePresent: Boolean(code),
          statePresent: Boolean(state),
        }
      )
    )
  }

  let step =
    "init" as
      | "init"
      | "state_verify"
      | "code_decode"
      | "token_exchange"
      | "identity_lookup"
      | "database_save"

  try {
    // Cookie may be missing after fetch()-based OAuth start (Set-Cookie on XHR
    // then cross-site eBay round-trip). Prefer request jar; fall back to URL
    // state which now carries the same encrypted payload as the cookie.
    step = "state_verify"
    const cookieValue =
      readOAuthStateCookieFromRequest(request) ||
      (await readOAuthStateCookie())
    try {
      resolveAndAssertOAuthState(cookieValue, state, "ebay")
    } catch (err) {
      throw new EbayOAuthStepError("state_verify", err, {
        cookiePresent: Boolean(cookieValue),
        queryStatePresent: Boolean(state),
        queryStateLength: state?.length ?? 0,
      })
    }
    console.info("[ebay/oauth] state verified", {
      cookiePresent: Boolean(cookieValue),
      queryStatePresent: Boolean(state),
      usedUrlStateFallback: !cookieValue && Boolean(state),
    })

    step = "code_decode"
    try {
      // nextUrl.searchParams is already decoded once. Only undo *extra*
      // percent-encoding (e.g. %252F → %2F → /), never decode a raw `#`.
      if (/%[0-9A-Fa-f]{2}/.test(code) && !code.includes("#")) {
        const once = decodeURIComponent(code)
        if (once !== code) code = once
      }
    } catch (err) {
      throw new EbayOAuthStepError("code_decode", err, {
        codeLength: code.length,
      })
    }

    step = "token_exchange"
    let tokens: Awaited<ReturnType<typeof exchangeEbayCode>>
    try {
      tokens = await exchangeEbayCode(code)
    } catch (err) {
      throw new EbayOAuthStepError("token_exchange", err, {
        codeLength: code.length,
        codeHasHash: code.includes("#"),
        codeHasPercent: code.includes("%"),
      })
    }
    if (!tokens.accessToken) {
      throw new EbayOAuthStepError(
        "token_exchange",
        "Token exchange returned no access_token",
        { expiresIn: tokens.expiresIn }
      )
    }

    const now = new Date().toISOString()
    let accountLabel = "eBay seller"
    const meta: Record<string, string> = {}
    step = "identity_lookup"
    try {
      const identity = (await ebayFetch(
        `/commerce/identity/v1/user/`,
        tokens.accessToken,
        { step: "getIdentityUser" }
      )) as {
        userId?: string
        username?: string
        accountType?: string
      }
      if (identity?.username) {
        accountLabel = identity.username
        meta.ebayUsername = identity.username
      }
      if (identity?.userId) {
        meta.ebayUserId = identity.userId
      }
    } catch (identityErr) {
      // Identity scope may be unavailable — connection still saved.
      console.info("[ebay/oauth] identity lookup skipped", {
        reason: "identity_unavailable",
        error: formatUnknownError(identityErr),
      })
    }

    step = "database_save"
    try {
      await saveConnection({
        marketplaceId: "ebay",
        authMethod: "oauth",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        accountLabel,
        meta: Object.keys(meta).length ? meta : undefined,
        connectedAt: now,
        updatedAt: now,
      })
    } catch (err) {
      throw new EbayOAuthStepError("database_save", err, {
        marketplaceId: "ebay",
        hasRefreshToken: Boolean(tokens.refreshToken),
        accountLabel,
      })
    }
    return redirectWith("connected")
  } catch (err) {
    const message =
      err instanceof EbayOAuthStepError
        ? err.message
        : formatOAuthFailure(step, err)
    console.error("[ebay/oauth] callback failure", {
      step: err instanceof EbayOAuthStepError ? err.step : step,
      message,
      details: err instanceof EbayOAuthStepError ? err.details : undefined,
      errorName: err instanceof Error ? err.name : typeof err,
      errorRaw: formatUnknownError(err),
    })
    return redirectWith("error", message)
  }
}
