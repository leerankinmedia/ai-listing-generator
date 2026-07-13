import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { DashboardHome } from "@/components/dashboard/dashboard-home"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { DEMO_COOKIE, parseDemoSession } from "@/lib/auth/demo"
import type { AuthSession } from "@/lib/types"

async function getSession(): Promise<AuthSession | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    return {
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
    }
  }

  const cookieStore = await cookies()
  return parseDemoSession(cookieStore.get(DEMO_COOKIE)?.value)
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/dashboard")
  }

  return (
    <DashboardShell user={session.user} isDemo={session.isDemo}>
      <DashboardHome user={session.user} />
    </DashboardShell>
  )
}
