import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/dashboard/shell"
import { DashboardOverview } from "@/components/dashboard/overview"
import { getCurrentUser } from "@/lib/auth/actions"

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <DashboardShell userName={user.fullName} userEmail={user.email}>
      <DashboardOverview userName={user.fullName} />
    </DashboardShell>
  )
}
