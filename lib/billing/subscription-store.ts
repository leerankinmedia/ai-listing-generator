import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/index"
import type { Stripe } from "stripe"

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"

export interface SubscriptionRow {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  status: SubscriptionStatus
  trial_start: string | null
  trial_end: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  has_used_trial: boolean
  created_at: string
  updated_at: string
}

function requireAdmin() {
  const admin = createServiceRoleClient()
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for billing writes.")
  }
  return admin
}

export async function getSubscriptionByUserId(
  userId: string
): Promise<SubscriptionRow | null> {
  const admin = createServiceRoleClient()
  if (!admin) return null
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return (data as SubscriptionRow | null) ?? null
}

export async function getSubscriptionByCustomerId(
  customerId: string
): Promise<SubscriptionRow | null> {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle()
  if (error) throw error
  return (data as SubscriptionRow | null) ?? null
}

export async function upsertSubscriptionForUser(
  userId: string,
  patch: Partial<
    Omit<SubscriptionRow, "id" | "user_id" | "created_at" | "updated_at">
  >
): Promise<SubscriptionRow> {
  const admin = requireAdmin()
  const payload = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await admin
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single()
  if (error) throw error
  return data as SubscriptionRow
}

export async function markWebhookProcessed(eventId: string, type: string) {
  const admin = requireAdmin()
  const { error } = await admin.from("stripe_webhook_events").insert({
    id: eventId,
    type,
  })
  if (error) {
    // Unique violation = already processed
    if (error.code === "23505") return false
    throw error
  }
  return true
}

export async function wasWebhookProcessed(eventId: string) {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

function toIso(seconds: number | null | undefined) {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return status
    default:
      return "none"
  }
}

export function subscriptionFieldsFromStripe(
  subscription: Stripe.Subscription
): Partial<
  Omit<SubscriptionRow, "id" | "user_id" | "created_at" | "updated_at">
> {
  const priceId =
    subscription.items.data[0]?.price?.id ??
    (typeof subscription.items.data[0]?.price === "string"
      ? subscription.items.data[0]?.price
      : null)

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id

  const usedTrial = Boolean(subscription.trial_start || subscription.trial_end)

  const periodEnd =
    (
      subscription as Stripe.Subscription & {
        current_period_end?: number
      }
    ).current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null

  return {
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    status: mapStripeStatus(subscription.status),
    trial_start: toIso(subscription.trial_start),
    trial_end: toIso(subscription.trial_end),
    current_period_end: toIso(periodEnd),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    ...(usedTrial ? { has_used_trial: true } : {}),
  }
}

export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  userIdHint?: string | null
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id

  let userId =
    userIdHint ||
    (subscription.metadata?.supabase_user_id as string | undefined) ||
    null

  if (!userId && customerId) {
    const existing = await getSubscriptionByCustomerId(customerId)
    userId = existing?.user_id ?? null
  }

  if (!userId) {
    throw new Error(
      `Cannot sync subscription ${subscription.id}: missing supabase user id`
    )
  }

  const fields = subscriptionFieldsFromStripe(subscription)
  return upsertSubscriptionForUser(userId, fields)
}
