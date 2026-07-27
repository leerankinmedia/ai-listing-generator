"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  clearDemoSession,
  createDemoUser,
  getDemoUser,
  isDemoAuthEnabled,
  setDemoSession,
  type DemoUser,
} from "@/lib/auth/demo"
import { getEmailValidationError, normalizeEmail } from "@/lib/auth/email"
import { clearBrowserSupabaseAuthCookies } from "@/lib/supabase/auth-cookies"
import { createClient } from "@/lib/supabase/client"

interface AuthUser {
  id: string
  email: string
  fullName?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function toAuthUser(demo: DemoUser): AuthUser {
  return { id: demo.id, email: demo.email, fullName: demo.fullName }
}

function toAuthUserFromSupabase(user: {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      (user.user_metadata?.full_name as string | undefined) ?? undefined,
  }
}

/** Server-authoritative wipe of every sb-*-auth-* cookie. */
async function purgeServerAuthCookies(): Promise<void> {
  await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  })
}

/** Rebuild auth cookies from scratch via the server Set-Cookie path. */
async function persistSessionCookies(session: {
  access_token: string
  refresh_token: string
}): Promise<{ id: string; email: string | null } | null> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  })
  const json = (await res.json()) as {
    ok?: boolean
    error?: string
    user?: { id: string; email: string | null }
  }
  if (!res.ok || !json.ok || !json.user) {
    throw new Error(json.error || "Could not persist auth session cookies.")
  }
  return json.user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const demoMode = isDemoAuthEnabled()

  useEffect(() => {
    let mounted = true

    if (demoMode) {
      const demo = getDemoUser()
      setUser(demo ? toAuthUser(demo) : null)
      setLoading(false)
      return () => {
        mounted = false
      }
    }

    const supabase = createClient()

    async function init() {
      try {
        const { data } = await supabase.auth.getUser()
        if (!mounted) return
        setUser(data.user ? toAuthUserFromSupabase(data.user) : null)
      } catch {
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user ? toAuthUserFromSupabase(session.user) : null)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [demoMode])

  const signOut = useCallback(async () => {
    if (demoMode) {
      clearDemoSession()
      setUser(null)
      return
    }
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "global" })
    } catch {
      // continue wipe
    } finally {
      clearBrowserSupabaseAuthCookies()
      try {
        await purgeServerAuthCookies()
      } catch {
        // ignore network errors — browser cookies already cleared
      }
      setUser(null)
    }
  }, [demoMode])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (demoMode) {
        if (!email || password.length < 6) {
          return { error: "Enter a valid email and password (6+ characters)." }
        }
        const existing = getDemoUser()
        const demo =
          existing && existing.email === email
            ? existing
            : createDemoUser(email)
        setDemoSession(demo)
        setUser(toAuthUser(demo))
        return {}
      }

      try {
        // 1) Complete logout — invalidate + wipe every prior auth cookie.
        try {
          const existing = createClient()
          await existing.auth.signOut({ scope: "global" })
        } catch {
          // ignore
        }
        clearBrowserSupabaseAuthCookies()
        await purgeServerAuthCookies()
        clearBrowserSupabaseAuthCookies()

        // 2) Fresh client (no singleton memory from the previous account).
        const supabase = createClient({ fresh: true })
        const { data: signInData, error } = await supabase.auth.signInWithPassword(
          {
            email,
            password,
          }
        )
        if (error) return { error: error.message }

        const session = signInData.session
        if (!session?.access_token || !session.refresh_token) {
          return {
            error:
              "Sign-in succeeded but no session was returned. Confirm the email, then try again.",
          }
        }

        // 3) Rebuild cookies from scratch on the server (authoritative).
        const persisted = await persistSessionCookies({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })

        // 4) Align the browser client with the same tokens.
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })

        const { data } = await supabase.auth.getUser()
        const nextUser = data.user
          ? toAuthUserFromSupabase(data.user)
          : persisted
            ? { id: persisted.id, email: persisted.email ?? email }
            : null
        if (nextUser) setUser(nextUser)
        return {}
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : "Unable to sign in. Please try again.",
        }
      }
    },
    [demoMode]
  )

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const emailError = getEmailValidationError(email)
      if (emailError) return { error: emailError }
      if (password.length < 6) {
        return { error: "Password must be at least 6 characters." }
      }
      const normalizedEmail = normalizeEmail(email)

      if (demoMode) {
        const demo = createDemoUser(normalizedEmail, fullName)
        setDemoSession(demo)
        setUser(toAuthUser(demo))
        return {}
      }

      try {
        try {
          const existing = createClient()
          await existing.auth.signOut({ scope: "global" })
        } catch {
          // ignore
        }
        clearBrowserSupabaseAuthCookies()
        await purgeServerAuthCookies()
        clearBrowserSupabaseAuthCookies()

        const supabase = createClient({ fresh: true })
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) return { error: error.message }

        if (signUpData.session?.access_token && signUpData.session.refresh_token) {
          const persisted = await persistSessionCookies({
            access_token: signUpData.session.access_token,
            refresh_token: signUpData.session.refresh_token,
          })
          await supabase.auth.setSession({
            access_token: signUpData.session.access_token,
            refresh_token: signUpData.session.refresh_token,
          })
          setUser({
            id: persisted?.id || signUpData.user?.id || "",
            email: persisted?.email || normalizedEmail,
            fullName,
          })
        } else if (signUpData.user) {
          setUser({
            ...toAuthUserFromSupabase(signUpData.user),
            email: signUpData.user.email ?? normalizedEmail,
            fullName,
          })
        }
        return {}
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : "Unable to create account. Please try again.",
        }
      }
    },
    [demoMode]
  )

  const value = useMemo(
    () => ({ user, loading, isDemo: demoMode, signIn, signUp, signOut }),
    [user, loading, demoMode, signIn, signUp, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
