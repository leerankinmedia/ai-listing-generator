import type { Metadata } from "next"
import { AiUsageAdminClient } from "@/components/admin/ai-usage-admin"

export const metadata: Metadata = {
  title: "AI usage (admin)",
  robots: { index: false, follow: false },
}

export default function AdminAiUsagePage() {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <AiUsageAdminClient />
    </div>
  )
}
