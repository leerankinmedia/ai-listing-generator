"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * If a recovery link lands on the Site URL (homepage) with a code or
 * hash tokens, forward to /reset-password so the new-password form shows.
 */
export function RecoveryRedirect() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return

    const url = new URL(window.location.href)
    const code = url.searchParams.get("code")
    const tokenHash = url.searchParams.get("token_hash")
    const type = url.searchParams.get("type")
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get("access_token")
    const hashType = hashParams.get("type")

    const isRecoveryQuery =
      Boolean(code) ||
      (Boolean(tokenHash) && (type === "recovery" || type === "magiclink"))
    const isRecoveryHash =
      Boolean(accessToken) &&
      (hashType === "recovery" || hashType === "invite" || !hashType)

    // Only intercept when we're not already on reset/callback routes
    const onAuthRoute =
      pathname?.startsWith("/reset-password") ||
      pathname?.startsWith("/auth/")

    if (onAuthRoute) return
    if (!isRecoveryQuery && !isRecoveryHash) return

    if (code || tokenHash) {
      const params = new URLSearchParams()
      if (code) params.set("code", code)
      if (tokenHash) params.set("token_hash", tokenHash)
      if (type) params.set("type", type)
      params.set("next", "/reset-password")
      router.replace(`/auth/callback?${params.toString()}`)
      return
    }

    if (accessToken) {
      router.replace(`/reset-password${url.hash}`)
    }
  }, [pathname, router])

  return null
}
