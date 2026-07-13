import { NextResponse } from "next/server"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import {
  DEMO_COOKIE,
  createDemoUser,
  serializeDemoUser,
} from "@/lib/auth/demo"

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string
    password?: string
    fullName?: string
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password
  const fullName = body.fullName?.trim()

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    )
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName ?? null },
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
            fullName: fullName ?? null,
            avatarUrl: null,
            createdAt: data.user.created_at,
          }
        : null,
      isDemo: false,
      needsEmailConfirmation: !data.session,
    })
  }

  const user = createDemoUser(email, fullName)
  const response = NextResponse.json({
    user,
    isDemo: true,
    needsEmailConfirmation: false,
  })
  response.cookies.set(DEMO_COOKIE, serializeDemoUser(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  })
  return response
}
