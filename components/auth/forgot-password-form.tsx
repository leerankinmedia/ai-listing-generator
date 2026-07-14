"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isDemoAuthEnabled } from "@/lib/auth/demo"
import { getPasswordRecoveryRedirectUrl } from "@/lib/auth/password-recovery"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const demoMode = isDemoAuthEnabled()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    const trimmed = email.trim()
    if (!trimmed) {
      setError("Enter the email for your ListWise account.")
      return
    }

    if (demoMode || !isSupabaseConfigured()) {
      setError(
        "Password recovery needs Supabase auth. Demo mode cannot send reset emails."
      )
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        { redirectTo: getPasswordRecoveryRedirectUrl() }
      )
      if (resetError) {
        setError(resetError.message)
        return
      }
      setMessage(
        "If an account exists for that email, a recovery link is on its way. Check your inbox and spam folder."
      )
    } catch {
      setError("Could not send a recovery email. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@shop.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
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

      <Button type="submit" variant="accent" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send recovery email"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
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
