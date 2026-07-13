import type { Metadata } from "next"
import { cookies } from "next/headers"
import { DashboardShell } from "@/components/dashboard/shell"
import { DashboardOverview } from "@/components/dashboard/overview"
import { isSupabaseConfigured } from "@/lib/supabase/config"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  let email = "demo@listwise.app"

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server")
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) email = user.email
    } catch {
      // Fall back to demo identity
    }
  } else {
    const cookieStore = await cookies()
    const demo = cookieStore.get("listwise_demo_session")
    if (demo?.value === "1") {
      email = "demo@listwise.app"
    }
  }

  return (
    <DashboardShell email={email}>
      <DashboardOverview />
    </DashboardShell>
  )
}
