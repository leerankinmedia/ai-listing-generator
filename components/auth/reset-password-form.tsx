"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { PasswordInput } from "@/components/auth/password-input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { isDemoAuthEnabled } from "@/lib/auth/demo"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

async function establishRecoverySession() {
  const supabase = createClient()
  const url = new URL(window.location.href)

  const code = url.searchParams.get("code")
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    window.history.replaceState({}, "", "/reset-password")
  }

  if (url.hash.includes("access_token")) {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""))
    const access_token = hash.get("access_token")
    const refresh_token = hash.get("refresh_token")
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      })
      if (error) throw error
      window.history.replaceState({}, "", "/reset-password")
    }
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)
  const demoMode = isDemoAuthEnabled()

  useEffect(() => {
    let mounted = true

    async function init() {
      if (demoMode || !isSupabaseConfigured()) {
        if (mounted) {
          setError(
            "Password reset needs Supabase auth. Open the recovery link from your email on the live app."
          )
          setChecking(false)
        }
        return
      }

      try {
        const session = await establishRecoverySession()
        if (!mounted) return
        if (!session) {
          setError(
            "This reset link is invalid or expired. Request a new recovery email."
          )
          setSessionReady(false)
        } else {
          setSessionReady(true)
        }
      } catch (err) {
        if (!mounted) return
        setError(
          err instanceof Error
            ? err.message
            : "Could not verify the recovery link. Request a new one."
        )
        setSessionReady(false)
      } finally {
        if (mounted) setChecking(false)
      }
    }

    void init()
    return () => {
      mounted = false
    }
  }, [demoMode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirm) {
      setError("New password and confirmation do not match.")
      return
    }
    if (!sessionReady) {
      setError("Recovery session missing. Request a new reset email.")
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) {
        setError(updateError.message)
        return
      }

      setMessage("Password updated. Redirecting you to log in…")
      await supabase.auth.signOut()
      router.push("/login?reset=success")
    } catch {
      setError("Could not update your password. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <p className="text-sm text-muted-foreground">Verifying recovery link…</p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading || !sessionReady}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Re-enter new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={loading || !sessionReady}
        />
      </div>

      {message && (
        <p
          className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {message}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="accent"
        className="w-full"
        disabled={loading || !sessionReady}
      >
        {loading ? "Saving…" : "Save new password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="font-semibold text-foreground hover:text-accent"
        >
          Request a new link
        </Link>
        {" · "}
        <Link
          href="/login"
          className="font-semibold text-foreground hover:text-accent"
        >
          Back to log in
        </Link>
      </p>
    </form>
  )
}
