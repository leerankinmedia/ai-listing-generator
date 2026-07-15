import { NextResponse } from "next/server"
import { getStripe } from "@/lib/billing/stripe"
import { isStripeBillingConfigured } from "@/lib/billing/config"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Confirm an Embedded Checkout session belongs to the signed-in user.
 * Used by /checkout/return after Stripe redirects back in-app.
 */
export async function GET(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    }

    if (!isStripeBillingConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured yet." },
        { status: 503 }
      )
    }

    const sessionId = new URL(request.url).searchParams.get("session_id")
    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id is required." },
        { status: 400 }
      )
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const sessionUserId =
      session.client_reference_id ||
      session.metadata?.supabase_user_id ||
      null

    if (sessionUserId && sessionUserId !== user.id) {
      return NextResponse.json({ error: "Session mismatch." }, { status: 403 })
    }

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null,
      subscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null,
      complete: session.status === "complete",
    })
  } catch (error) {
    console.error("[billing/checkout/session]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load checkout session.",
      },
      { status: 500 }
    )
  }
}
