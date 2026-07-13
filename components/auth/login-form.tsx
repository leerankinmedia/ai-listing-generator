"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth/auth-provider"

export function LoginForm() {
  const router = useRouter()
  const { signIn, isDemo } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn(email.trim(), password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.push("/dashboard")
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {isDemo && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground">
          Demo mode is on — any email and a 6+ character password will sign you
          in. Connect Supabase via <code>.env</code> for production auth.
        </p>
      )}

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
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variant="accent" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Log in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to ListWise?{" "}
        <Link href="/signup" className="font-semibold text-foreground hover:text-accent">
          Create an account
        </Link>
      </p>
    </form>
  )
}
