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
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    )
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName:
          (data.user.user_metadata?.full_name as string | undefined) ?? null,
        avatarUrl:
          (data.user.user_metadata?.avatar_url as string | undefined) ?? null,
        createdAt: data.user.created_at,
      },
      isDemo: false,
    })
  }

  // Demo mode: accept any credentials and issue a session cookie
  const user = createDemoUser(email)
  const response = NextResponse.json({ user, isDemo: true })
  response.cookies.set(DEMO_COOKIE, serializeDemoUser(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  })
  return response
}
