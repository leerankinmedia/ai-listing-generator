"use client"

import Link from "next/link"
import { useActionState } from "react"
import { signUp, type AuthResult } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isSupabaseConfiguredClient } from "@/lib/supabase/public-config"

const initial: AuthResult = {}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initial)
  const demoMode = !isSupabaseConfiguredClient()

  return (
    <form action={formAction} className="space-y-5">
      {demoMode && (
        <div className="rounded-lg border border-[var(--lw-accent)]/30 bg-[var(--lw-accent)]/10 px-3.5 py-3 text-sm text-[var(--lw-fg-muted)]">
          Demo mode is on — sign up with any details to explore the dashboard.
          Wire Supabase for production auth.
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Alex Reseller"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@shop.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-rose-500" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-[var(--lw-fg-muted)]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--lw-accent)] hover:underline"
        >
          Log in
        </Link>
      </p>
    </form>
  )
}
