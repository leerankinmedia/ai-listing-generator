"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { DEMO_COOKIE } from "@/lib/supabase/middleware"

export type AuthResult = {
  error?: string
  success?: boolean
}

export async function signUp(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")
  const fullName = String(formData.get("fullName") || "").trim()

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }

  if (!isSupabaseConfigured()) {
    const cookieStore = await cookies()
    cookieStore.set(DEMO_COOKIE, JSON.stringify({ email, fullName }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    redirect("/dashboard")
  }

  const supabase = await createClient()
  if (!supabase) return { error: "Auth is unavailable." }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })

  if (error) return { error: error.message }

  redirect("/dashboard")
}

export async function signIn(
  _prev: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: "Email and password are required." }
  }

  if (!isSupabaseConfigured()) {
    const cookieStore = await cookies()
    const existing = cookieStore.get(DEMO_COOKIE)?.value
    let fullName = email.split("@")[0] || "Seller"
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { fullName?: string; email?: string }
        if (parsed.email === email && parsed.fullName) {
          fullName = parsed.fullName
        }
      } catch {
        // ignore malformed demo cookie
      }
    }
    cookieStore.set(DEMO_COOKIE, JSON.stringify({ email, fullName }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    redirect("/dashboard")
  }

  const supabase = await createClient()
  if (!supabase) return { error: "Auth is unavailable." }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) return { error: error.message }

  const next = String(formData.get("next") || "/dashboard")
  redirect(next.startsWith("/") ? next : "/dashboard")
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    const cookieStore = await cookies()
    cookieStore.delete(DEMO_COOKIE)
    redirect("/")
  }

  const supabase = await createClient()
  if (supabase) {
    await supabase.auth.signOut()
  }
  redirect("/")
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    const cookieStore = await cookies()
    const raw = cookieStore.get(DEMO_COOKIE)?.value
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { email: string; fullName?: string }
      return {
        id: "demo-user",
        email: parsed.email,
        fullName: parsed.fullName || "Demo Seller",
        avatarUrl: null,
      }
    } catch {
      return null
    }
  }

  const supabase = await createClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return {
    id: user.id,
    email: user.email || "",
    fullName:
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "Seller",
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
  }
}
