export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Soft-lock only: Overview, Listings (read-only), Billing, and sign-out stay
  // reachable when a trial expires. Paid actions are gated by PaidFeatureGate
  // and server getEntitlement() — never by a dashboard-wide Billing redirect.
  return children
}
