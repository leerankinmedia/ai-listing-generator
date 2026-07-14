import { NextResponse } from "next/server"
import { getBillingAppOrigin, isStripeBillingConfigured } from "@/lib/billing/config"
import { getStripe } from "@/lib/billing/stripe"
import { getSubscriptionByUserId } from "@/lib/billing/subscription-store"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

export async function POST() {
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

    const subscription = await getSubscriptionByUserId(user.id)
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer yet. Start a trial first." },
        { status: 400 }
      )
    }

    const stripe = getStripe()
    const origin = getBillingAppOrigin()
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[billing/portal]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open billing portal.",
      },
      { status: 500 }
    )
  }
}
