"use client"

import { SubscriptionGate } from "@/components/billing/subscription-gate"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SubscriptionGate>{children}</SubscriptionGate>
}
