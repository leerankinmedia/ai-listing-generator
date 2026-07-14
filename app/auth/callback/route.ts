import { type EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Supabase auth callback for password recovery (and other email links).
 * Exchanges ?code= or token_hash for a session, then sends the user to
 * /reset-password (or the safe `next` path).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const nextParam = searchParams.get("next") || "/reset-password"
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/reset-password"

  const redirectTo = new URL(next, origin)

  try {
    const supabase = await createClient()

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(redirectTo)
      }
      redirectTo.pathname = "/reset-password"
      redirectTo.searchParams.set("error", "recovery_failed")
      return NextResponse.redirect(redirectTo)
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      })
      if (!error) {
        return NextResponse.redirect(redirectTo)
      }
      redirectTo.pathname = "/reset-password"
      redirectTo.searchParams.set("error", "recovery_failed")
      return NextResponse.redirect(redirectTo)
    }
  } catch {
    // Fall through to reset page with error
  }

  redirectTo.pathname = "/reset-password"
  redirectTo.searchParams.set("error", "missing_code")
  return NextResponse.redirect(redirectTo)
}
