"use client"

import { useEffect, useState } from "react"

/**
 * Optional Auth Accepted URL target:
 *   https://ai-listing-generator-n2ji.vercel.app/ebay/oauth/callback
 *
 * Recovers eBay OAuth query params (including cases where `#` in the code
 * becomes a URL fragment) and forwards to the API callback with encoding.
 */
export default function EbayOAuthCallbackBridgePage() {
  const [status, setStatus] = useState("Recovering eBay OAuth parameters…")
  const [debug, setDebug] = useState("")

  useEffect(() => {
    const href = window.location.href
    const url = new URL(href)
    const params = new URLSearchParams(url.search)
    const raw = href.includes("?") ? href.slice(href.indexOf("?") + 1) : ""

    if (url.hash.length > 1) {
      const hashBody = url.hash.slice(1)
      if (hashBody.includes("=") || hashBody.startsWith("&")) {
        const hp = new URLSearchParams(
          hashBody.startsWith("&") ? hashBody.slice(1) : hashBody
        )
        hp.forEach((v, k) => {
          if (!params.has(k)) params.set(k, v)
        })
      }
      if (params.get("code") && raw.includes("#")) {
        const codeStart = raw.indexOf("code=") + 5
        const endMatch = raw
          .slice(codeStart)
          .search(/&(state|expires_in|error|error_description)=/)
        const codeRaw =
          endMatch >= 0
            ? raw.slice(codeStart, codeStart + endMatch)
            : raw.slice(codeStart)
        if (codeRaw && codeRaw.length > (params.get("code") || "").length) {
          params.set("code", codeRaw)
        }
        if (!params.get("state")) {
          const sm = raw.match(/&(state)=([^&]*)/)
          if (sm) params.set("state", decodeURIComponent(sm[2]))
        }
      }
    }

    const safe = {
      paramNames: Array.from(params.keys()),
      codePresent: Boolean(params.get("code")),
      statePresent: Boolean(params.get("state")),
      errorPresent: Boolean(params.get("error")),
      errorDescriptionPresent: Boolean(params.get("error_description")),
      codeLength: params.get("code")?.length ?? 0,
      stateLength: params.get("state")?.length ?? 0,
    }
    setDebug(JSON.stringify(safe, null, 2))

    const next = new URL(
      "/api/marketplaces/ebay/oauth/callback",
      window.location.origin
    )
    if (params.get("error")) {
      next.searchParams.set("error", params.get("error")!)
      const desc = params.get("error_description")
      if (desc) next.searchParams.set("error_description", desc)
      next.searchParams.set("bridged", "1")
      setStatus("eBay returned an error. Redirecting…")
      window.location.replace(next.toString())
      return
    }

    const code = params.get("code")
    if (!code) {
      setStatus(
        "No OAuth code found. Set the RuName Auth Accepted URL to this page or /api/marketplaces/ebay/oauth/callback, then reconnect."
      )
      return
    }

    next.searchParams.set("code", code)
    const state = params.get("state")
    if (state) next.searchParams.set("state", state)
    next.searchParams.set("bridged", "1")
    setStatus("Code recovered. Finishing connection…")
    window.location.replace(next.toString())
  }, [])

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-lg font-semibold tracking-tight">
        Completing eBay connection…
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{status}</p>
      {debug ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">
          {debug}
        </pre>
      ) : null}
    </main>
  )
}
