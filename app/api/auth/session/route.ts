import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { DEMO_COOKIE, parseDemoSession } from "@/lib/auth/demo"

export async function GET() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ session: null })
    }

    return NextResponse.json({
      session: {
        user: {
          id: user.id,
          email: user.email ?? "",
          fullName:
            (user.user_metadata?.full_name as string | undefined) ?? null,
          avatarUrl:
            (user.user_metadata?.avatar_url as string | undefined) ?? null,
          createdAt: user.created_at,
        },
        isDemo: false,
      },
    })
  }

  const cookieStore = await cookies()
  const session = parseDemoSession(cookieStore.get(DEMO_COOKIE)?.value)
  return NextResponse.json({ session })
}
