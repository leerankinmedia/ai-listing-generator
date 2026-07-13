"use client"

import Link from "next/link"
import { useActionState } from "react"
import { signIn, type AuthResult } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isSupabaseConfiguredClient } from "@/lib/supabase/public-config"

const initial: AuthResult = {}

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initial)
  const demoMode = !isSupabaseConfiguredClient()

  return (
    <form action={formAction} className="space-y-5">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      {demoMode && (
        <div className="rounded-lg border border-[var(--lw-accent)]/30 bg-[var(--lw-accent)]/10 px-3.5 py-3 text-sm text-[var(--lw-fg-muted)]">
          Demo mode is on — any email and password signs you into the dashboard.
          Add Supabase env vars for real auth.
        </div>
      )}

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
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-rose-500" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-[var(--lw-fg-muted)]">
        New to ListWise?{" "}
        <Link
          href="/signup"
          className="font-semibold text-[var(--lw-accent)] hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  )
}
