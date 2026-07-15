import { NextResponse } from "next/server"
import {
  BILLING_TRIAL_DAYS,
  getBillingAppOrigin,
  getStripePriceId,
  isStripeBillingConfigured,
  MONTHLY_LISTING_CREDITS,
  PLAN_NAME,
  statusGrantsAccess,
} from "@/lib/billing/config"
import { getStripe } from "@/lib/billing/stripe"
import {
  getSubscriptionByUserId,
  upsertSubscriptionForUser,
} from "@/lib/billing/subscription-store"
import {
  getEmailValidationError,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth/email"
import {
  createServiceRoleClient,
  getServerAuthUser,
} from "@/lib/supabase/index"

export const runtime = "nodejs"

type CheckoutBody = {
  billingEmail?: string
  confirmBillingEmail?: string
}

async function updateAuthEmail(userId: string, email: string) {
  const admin = createServiceRoleClient()
  if (!admin) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to update billing email."
    )
  }
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  })
  if (error) {
    throw new Error(error.message || "Could not update account email.")
  }
}

/**
 * Create an Embedded Checkout Session (ui_mode: embedded_page).
 * Never sends a malformed email to Stripe — asks the client for a corrected
 * billing email when the stored auth email is invalid.
 */
export async function POST(request: Request) {
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

    let body: CheckoutBody = {}
    try {
      const raw = await request.json()
      if (raw && typeof raw === "object") {
        body = raw as CheckoutBody
      }
    } catch {
      // Empty body is fine for users with a valid stored email
    }

    const storedEmail = user.email?.trim() || ""
    const providedEmail = body.billingEmail
      ? normalizeEmail(body.billingEmail)
      : ""
    const confirmEmail = body.confirmBillingEmail
      ? normalizeEmail(body.confirmBillingEmail)
      : ""

    let billingEmail = ""

    if (providedEmail || confirmEmail) {
      const providedError = getEmailValidationError(providedEmail)
      if (providedError) {
        return NextResponse.json(
          {
            error: providedError,
            code: "invalid_billing_email",
            currentEmail: storedEmail || null,
          },
          { status: 422 }
        )
      }
      if (providedEmail !== confirmEmail) {
        return NextResponse.json(
          {
            error: "Billing email and confirmation do not match.",
            code: "invalid_billing_email",
            currentEmail: storedEmail || null,
          },
          { status: 422 }
        )
      }
      billingEmail = providedEmail

      if (normalizeEmail(storedEmail) !== billingEmail) {
        await updateAuthEmail(user.id, billingEmail)
      }
    } else if (isValidEmail(storedEmail)) {
      billingEmail = normalizeEmail(storedEmail)
    } else {
      return NextResponse.json(
        {
          error:
            "Your account email is invalid. Enter a valid billing email to continue checkout.",
          code: "invalid_billing_email",
          currentEmail: storedEmail || null,
        },
        { status: 422 }
      )
    }

    // Final guard — never send malformed emails to Stripe
    if (!isValidEmail(billingEmail)) {
      return NextResponse.json(
        {
          error: "Enter a valid billing email to continue.",
          code: "invalid_billing_email",
          currentEmail: storedEmail || null,
        },
        { status: 422 }
      )
    }

    const priceId = getStripePriceId()
    const stripe = getStripe()
    const origin = getBillingAppOrigin()
    const existing = await getSubscriptionByUserId(user.id)

    // Block users who already have a trial or active subscription
    if (statusGrantsAccess(existing?.status)) {
      return NextResponse.json(
        {
          error:
            "You already have an active ListWise Pro trial or subscription.",
          code: "already_subscribed",
          status: existing?.status,
        },
        { status: 409 }
      )
    }

    // Never grant a second trial to the same user
    const allowTrial = !existing?.has_used_trial && !existing?.trial_start

    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      billingEmail.split("@")[0]

    let customerId = existing?.stripe_customer_id ?? null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: billingEmail,
        name: displayName,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await upsertSubscriptionForUser(user.id, {
        stripe_customer_id: customerId,
        status: existing?.status ?? "none",
        has_used_trial: existing?.has_used_trial ?? false,
      })
    } else {
      await stripe.customers.update(customerId, {
        email: billingEmail,
        name: displayName,
        metadata: { supabase_user_id: user.id },
      })
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      // Card required before the 7-day trial begins
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_name: PLAN_NAME,
          listing_credits: String(MONTHLY_LISTING_CREDITS),
        },
        ...(allowTrial ? { trial_period_days: BILLING_TRIAL_DAYS } : {}),
      },
      metadata: {
        supabase_user_id: user.id,
        plan_name: PLAN_NAME,
        listing_credits: String(MONTHLY_LISTING_CREDITS),
        billing_email: billingEmail,
      },
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    })

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Could not create Embedded Checkout session." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      trialEligible: allowTrial,
      trialDays: allowTrial ? BILLING_TRIAL_DAYS : 0,
      billingEmail,
    })
  } catch (error) {
    console.error("[billing/checkout]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout session failed. Try again.",
      },
      { status: 500 }
    )
  }
}
