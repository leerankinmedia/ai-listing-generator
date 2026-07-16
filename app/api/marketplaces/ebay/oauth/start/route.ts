import { NextRequest, NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  inspectEbayAuthorizeRequest,
  isEbayConfigured,
  type EbayAuthorizeDebug,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import { checkSubscriptionAccess } from "@/lib/billing/access"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  createOAuthState,
  persistOAuthState,
} from "@/lib/marketplaces/oauth-state"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

function renderDebugHtml(debug: EbayAuthorizeDebug): string {
  const rows: [string, string][] = [
    ["ebayEnv", debug.ebayEnv],
    ["authDomain", debug.authDomain],
    ["authBase", debug.authBase],
    ["response_type", debug.response_type],
    ["redirect_uri (exact)", debug.redirect_uri],
    [
      "redirect_uri looks like URL?",
      debug.redirect_uri_looks_like_url ? "YES (bad)" : "no (good)",
    ],
    ["client_id (redacted)", debug.client_id_redacted],
    ["state present", debug.state_present ? "yes" : "no"],
    ["state length", String(debug.state_length)],
    ["scope encoding %20", debug.scope_encoding_uses_percent_20 ? "yes" : "no"],
    ["scope encoding +", debug.scope_encoding_uses_plus ? "YES (bad)" : "no"],
    ["param keys", debug.param_keys.join(", ")],
  ]

  const scopeList = debug.scopes_decoded
    .map((s) => `<li><code>${escapeHtml(s)}</code></li>`)
    .join("")

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td><code>${escapeHtml(v)}</code></td></tr>`
    )
    .join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>eBay OAuth authorize debug</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 16px; background: #f6f3ee; color: #1c1917; line-height: 1.45; }
    h1 { font-size: 1.15rem; margin: 0 0 8px; }
    .banner { background: #fff7ed; border: 1px solid #fdba74; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; }
    th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid #e7e5e4; font-size: 0.9rem; }
    th { width: 42%; color: #57534e; font-weight: 600; }
    code { word-break: break-all; font-size: 0.84rem; }
    ul { margin: 8px 0 0; padding-left: 1.1rem; }
    .url { margin-top: 14px; background: #fff; border-radius: 10px; padding: 12px; }
    .url h2 { font-size: 0.95rem; margin: 0 0 8px; }
    a.back { display: inline-block; margin-top: 16px; color: #0f766e; }
  </style>
</head>
<body>
  <h1>Temporary eBay OAuth debug</h1>
  <div class="banner">Safe view: <strong>client_id</strong> is redacted (last 6 only). Secrets are never logged or shown. Remove after Sandbox OAuth works.</div>
  <table>${tableRows}</table>
  <div class="url">
    <h2>Decoded scopes</h2>
    <ul>${scopeList}</ul>
  </div>
  <div class="url">
    <h2>Authorize URL (client_id redacted)</h2>
    <code>${escapeHtml(debug.authorize_url_redacted)}</code>
  </div>
  <a class="back" href="/dashboard/connections">← Back to Connections</a>
  <p style="margin-top:12px;font-size:0.8rem;color:#78716c">Also available as JSON: add <code>&amp;format=json</code></p>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export async function GET(request: NextRequest) {
  try {
    const user = await getServerAuthUser()
    const access = await checkSubscriptionAccess(user?.id)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: "Start your 7-day free trial to unlock this feature.",
          code: "subscription_required",
        },
        { status: 402 }
      )
    }

    if (!isConnectionsCryptoConfigured()) {
      return NextResponse.json(
        {
          error:
            "CONNECTIONS_SECRET is required before connecting marketplaces.",
        },
        { status: 503 }
      )
    }
    if (!isEbayConfigured()) {
      return NextResponse.json(
        {
          error:
            "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME.",
        },
        { status: 503 }
      )
    }

    const debugMode =
      request.nextUrl.searchParams.get("debug") === "1" ||
      request.nextUrl.searchParams.get("debug") === "true"
    const format = (
      request.nextUrl.searchParams.get("format") || ""
    ).toLowerCase()
    const wantsJson =
      format === "json" ||
      (request.headers.get("accept") || "").includes("application/json")

    const state = createOAuthState("ebay")
    await persistOAuthState(state)

    if (debugMode) {
      const debug = inspectEbayAuthorizeRequest(state)
      if (wantsJson) {
        return NextResponse.json(debug, {
          headers: {
            "Cache-Control": "no-store",
          },
        })
      }
      return new NextResponse(renderDebugHtml(debug), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      })
    }

    const url = buildEbayAuthorizeUrl(state)
    return NextResponse.redirect(url)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      { status: 500 }
    )
  }
}
