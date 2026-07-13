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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const demoMode = isDemoAuthEnabled()

  useEffect(() => {
    let mounted = true

    async function init() {
      if (demoMode) {
        const demo = getDemoUser()
        if (mounted) {
          setUser(demo ? toAuthUser(demo) : null)
          setLoading(false)
        }
        return
      }

      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!mounted) return
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email ?? "",
            fullName:
              (data.user.user_metadata?.full_name as string | undefined) ??
              undefined,
          })
        } else {
          setUser(null)
        }
      } catch {
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void init()
    return () => {
      mounted = false
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
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) return { error: error.message }
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email ?? "",
            fullName:
              (data.user.user_metadata?.full_name as string | undefined) ??
              undefined,
          })
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
      if (demoMode) {
        if (!email || password.length < 6) {
          return { error: "Enter a valid email and password (6+ characters)." }
        }
        const demo = createDemoUser(email, fullName)
        setDemoSession(demo)
        setUser(toAuthUser(demo))
        return {}
      }

      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) return { error: error.message }
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email ?? "",
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
      await supabase.auth.signOut()
    } finally {
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
