import "server-only"
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "@/lib/billing/config"
import { getStripe } from "@/lib/billing/stripe"
import {
  getSubscriptionByCustomerId,
  markWebhookProcessed,
  syncSubscriptionFromStripe,
  upsertSubscriptionForUser,
  wasWebhookProcessed,
} from "@/lib/billing/subscription-store"

async function resolveUserIdFromCheckout(session: Stripe.Checkout.Session) {
  if (session.client_reference_id) return session.client_reference_id
  if (session.metadata?.supabase_user_id) return session.metadata.supabase_user_id
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id
  if (customerId) {
    const row = await getSubscriptionByCustomerId(customerId)
    return row?.user_id ?? null
  }
  return null
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripe()
  const userId = await resolveUserIdFromCheckout(session)
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id

  if (userId && customerId) {
    await upsertSubscriptionForUser(userId, {
      stripe_customer_id: customerId,
      ...(subscriptionId
        ? { stripe_subscription_id: subscriptionId }
        : {}),
    })
  }

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await syncSubscriptionFromStripe(subscription, userId)
  }
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription) {
  await syncSubscriptionFromStripe(subscription)
}

async function handleInvoiceEvent(invoice: Stripe.Invoice) {
  const stripe = getStripe()
  const rawSub =
    (invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null
    }).subscription ?? null
  const subscriptionId =
    typeof rawSub === "string" ? rawSub : rawSub?.id ?? null
  if (!subscriptionId) return
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await syncSubscriptionFromStripe(subscription)
}

/**
 * Stripe webhook POST handler.
 * Verifies stripe-signature against STRIPE_WEBHOOK_SECRET, then syncs
 * subscription rows via SUPABASE_SERVICE_ROLE_KEY.
 */
export async function handleStripeWebhookPost(request: Request) {
  if (!getStripeSecretKey()) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not configured." },
      { status: 503 }
    )
  }

  const webhookSecret = getStripeWebhookSecret()
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    )
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 })
  }

  // Must use the raw body for signature verification
  const rawBody = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error("[stripe/webhook] signature verification failed", error)
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  try {
    if (await wasWebhookProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      case "customer.subscription.created":
      case "customer.subscription.updated":
        // Syncs status, cancel_at_period_end, trial_end, current_period_end
        await handleSubscriptionEvent(
          event.data.object as Stripe.Subscription
        )
        break
      case "customer.subscription.deleted":
        // Marks canceled / ended — paid tools lock via status !== trialing|active
        await handleSubscriptionEvent(
          event.data.object as Stripe.Subscription
        )
        break
      case "invoice.paid":
      case "invoice.payment_failed":
        // Failed first invoice after trial → past_due/unpaid sync + lock
        await handleInvoiceEvent(event.data.object as Stripe.Invoice)
        break
      default:
        break
    }

    await markWebhookProcessed(event.id, event.type)
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[stripe/webhook] handler failed", event.type, error)
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    )
  }
}
