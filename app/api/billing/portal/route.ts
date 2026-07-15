import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Hosted Stripe Customer Portal is no longer used for cancellation.
 * Use POST /api/billing/subscription with action cancel|reactivate instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Hosted Stripe portal is disabled. Cancel or reactivate from ListWise Billing.",
      code: "portal_disabled",
    },
    { status: 410 }
  )
}
