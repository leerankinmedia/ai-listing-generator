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

    // Keep React auth state aligned with the cookie-backed SSR session.
    // Without this, the UI can show user A while document cookies still have user B
    // (full-page OAuth navigations only see cookies).
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
        const supabase = createClient()
        // Drop any prior account session/cookies first (e.g. leerankin53) so the
        // cookie jar cannot keep serving that user to /api routes after login.
        await supabase.auth.signOut({ scope: "local" })
        clearBrowserSupabaseAuthCookies()

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) return { error: error.message }

        // Re-persist the new session into cookies (source of truth for OAuth).
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession()
        if (sessionError) return { error: sessionError.message }
        if (sessionData.session) {
          await supabase.auth.setSession({
            access_token: sessionData.session.access_token,
            refresh_token: sessionData.session.refresh_token,
          })
        }

        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser(toAuthUserFromSupabase(data.user))
        }
        return {}
      } catch {
        return { error: "Unable to sign in. Please try again." }
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
        const supabase = createClient()
        await supabase.auth.signOut({ scope: "local" })
        clearBrowserSupabaseAuthCookies()

        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) return { error: error.message }

        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData.session) {
          await supabase.auth.setSession({
            access_token: sessionData.session.access_token,
            refresh_token: sessionData.session.refresh_token,
          })
        }

        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser({
            ...toAuthUserFromSupabase(data.user),
            email: data.user.email ?? normalizedEmail,
            fullName:
              (data.user.user_metadata?.full_name as string | undefined) ??
              fullName,
          })
        }
        return {}
      } catch {
        return { error: "Unable to create account. Please try again." }
      }
    },
    [demoMode]
  )

  const signOut = useCallback(async () => {
    if (demoMode) {
      clearDemoSession()
      setUser(null)
      return
    }
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "global" })
    } finally {
      clearBrowserSupabaseAuthCookies()
      setUser(null)
    }
  }, [demoMode])

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
