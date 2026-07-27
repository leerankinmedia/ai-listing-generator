import "server-only"
import { getStripe } from "@/lib/billing/stripe"
import { isStripeBillingConfigured } from "@/lib/billing/config"
import { decideEntitlement } from "@/lib/billing/entitlement-rules"
import { isListWiseOwnerEmail } from "@/lib/billing/owner"
import {
  getSubscriptionByUserId,
  upsertSubscriptionForUser,
  type SubscriptionRow,
} from "@/lib/billing/subscription-store"
import { createServiceRoleClient } from "@/lib/supabase/index"

export type EntitlementStatus =
  | "none"
  | "trialing"
  | "active"
  | "expired"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "admin"
  | "owner"

export type EntitlementDebug = {
  rawDatabaseStatus: string | null
  trialEnd: string | null
  stripeSubscriptionIdPresent: boolean
  stripeVerifiedStatus: string | null
  finalEntitlement: EntitlementStatus
  decidingField: string
  summary: string
}

export type Entitlement = {
  allowed: boolean
  status: EntitlementStatus
  statusLabel: string
  displayPeriodEnd: string | null
  trialEnd: string | null
  reason:
    | "missing_user"
    | "no_subscription"
    | "inactive"
    | "active"
    | "admin"
    | "owner"
  adminOverride: boolean
  ownerOverride: boolean
  stripeSubscriptionId: string | null
  subscription: SubscriptionRow | null
  debug: EntitlementDebug
}

export type GetEntitlementOptions = {
  nowMs?: number
  /** Prefer the authenticated user's email when available. */
  email?: string | null
}

function statusLabelFor(status: EntitlementStatus): string {
  switch (status) {
    case "trialing":
      return "Trialing"
    case "active":
      return "Active"
    case "expired":
      return "Trial expired"
    case "owner":
      return "Owner"
    case "admin":
      return "Admin override"
    case "past_due":
      return "Past due"
    case "canceled":
      return "Canceled"
    case "unpaid":
      return "Unpaid"
    case "none":
      return "No subscription"
    default:
      return status
  }
}

/** Look up the auth email for a user id (source of truth for Owner checks). */
async function lookupEmailByUserId(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  if (!admin) return null
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

function ownerEntitlement(): Entitlement {
  return {
    allowed: true,
    status: "owner",
    statusLabel: statusLabelFor("owner"),
    displayPeriodEnd: null,
    trialEnd: null,
    reason: "owner",
    adminOverride: true,
    ownerOverride: true,
    stripeSubscriptionId: null,
    subscription: null,
    debug: {
      rawDatabaseStatus: null,
      trialEnd: null,
      stripeSubscriptionIdPresent: false,
      stripeVerifiedStatus: null,
      finalEntitlement: "owner",
      decidingField: "owner_email",
      summary:
        "Permanent Owner account — bypasses subscription, trial, Stripe, credits, and feature locks.",
    },
  }
}

function adminEntitlement(): Entitlement {
  return {
    allowed: true,
    status: "admin",
    statusLabel: statusLabelFor("admin"),
    displayPeriodEnd: null,
    trialEnd: null,
    reason: "admin",
    adminOverride: true,
    ownerOverride: false,
    stripeSubscriptionId: null,
    subscription: null,
    debug: {
      rawDatabaseStatus: null,
      trialEnd: null,
      stripeSubscriptionIdPresent: false,
      stripeVerifiedStatus: null,
      finalEntitlement: "admin",
      decidingField: "admin_override",
      summary: "Access granted via LISTWISE_ADMIN_USER_IDS for this user id.",
    },
  }
}

/** Explicit allow-list of user IDs — never fake subscription rows. */
export function getAdminOverrideUserIds(): Set<string> {
  const raw =
    process.env.LISTWISE_ADMIN_USER_IDS ||
    process.env.BILLING_ADMIN_USER_IDS ||
    ""
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

export function isAdminOverrideUser(userId: string): boolean {
  return getAdminOverrideUserIds().has(userId)
}

async function retrieveStripeSubscriptionStatus(
  stripeSubscriptionId: string
): Promise<{
  status: string | null
  trialEnd: string | null
  currentPeriodEnd: string | null
  error?: string
}> {
  if (!isStripeBillingConfigured()) {
    return {
      status: null,
      trialEnd: null,
      currentPeriodEnd: null,
      error: "stripe_not_configured",
    }
  }
  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    const trialEnd = sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null
    const periodEndRaw =
      (sub as { current_period_end?: number }).current_period_end ?? null
    const currentPeriodEnd = periodEndRaw
      ? new Date(periodEndRaw * 1000).toISOString()
      : null
    return {
      status: sub.status,
      trialEnd,
      currentPeriodEnd,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "stripe_retrieve_failed"
    const safe = /no such subscription/i.test(message)
      ? "no_such_subscription"
      : "stripe_retrieve_failed"
    return { status: null, trialEnd: null, currentPeriodEnd: null, error: safe }
  }
}

async function persistExpiredCorrection(
  userId: string,
  subscription: SubscriptionRow
) {
  try {
    await upsertSubscriptionForUser(userId, {
      status: "canceled",
      current_period_end: null,
      cancel_at_period_end: false,
    })
    console.info("[billing/entitlement] TEMP persisted expired correction", {
      userId,
      previousStatus: subscription.status,
      trialEnd: subscription.trial_end,
      hadStripeId: Boolean(subscription.stripe_subscription_id),
      decidingNote: "Cleared fabricated current_period_end; DB status→canceled",
    })
  } catch (error) {
    console.error("[billing/entitlement] persist expired failed", error)
  }
}

/**
 * Single server-side source of truth for paid access.
 * See entitlement-rules.ts for the pure decision table.
 *
 * Permanent Owner (leerankinmedia@gmail.com) and LISTWISE_ADMIN_USER_IDS
 * bypass Stripe / trial / subscription checks forever.
 */
export async function getEntitlement(
  userId: string | null | undefined,
  nowOrOptions: number | GetEntitlementOptions = Date.now()
): Promise<Entitlement> {
  const options: GetEntitlementOptions =
    typeof nowOrOptions === "number"
      ? { nowMs: nowOrOptions }
      : nowOrOptions ?? {}
  const nowMs = options.nowMs ?? Date.now()

  if (!userId) {
    return {
      allowed: false,
      status: "none",
      statusLabel: statusLabelFor("none"),
      displayPeriodEnd: null,
      trialEnd: null,
      reason: "missing_user",
      adminOverride: false,
      ownerOverride: false,
      stripeSubscriptionId: null,
      subscription: null,
      debug: {
        rawDatabaseStatus: null,
        trialEnd: null,
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
        finalEntitlement: "none",
        decidingField: "missing_user",
        summary: "No authenticated user.",
      },
    }
  }

  // Owner email — permanent, server-side, no Stripe/trial/credits required.
  // Prefer Auth Admin lookup by user id so a forged email string cannot unlock.
  const lookedUpEmail = await lookupEmailByUserId(userId)
  if (isListWiseOwnerEmail(lookedUpEmail)) {
    return ownerEntitlement()
  }
  // Fallback when service-role lookup is unavailable (local/dev): trust the
  // session email passed from getServerAuthUser() only.
  if (!lookedUpEmail && isListWiseOwnerEmail(options.email)) {
    return ownerEntitlement()
  }

  if (isAdminOverrideUser(userId)) {
    return adminEntitlement()
  }

  const subscription = await getSubscriptionByUserId(userId)
  if (!subscription) {
    return {
      allowed: false,
      status: "none",
      statusLabel: statusLabelFor("none"),
      displayPeriodEnd: null,
      trialEnd: null,
      reason: "no_subscription",
      adminOverride: false,
      ownerOverride: false,
      stripeSubscriptionId: null,
      subscription: null,
      debug: {
        rawDatabaseStatus: null,
        trialEnd: null,
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
        finalEntitlement: "none",
        decidingField: "no_subscription_row",
        summary: "No subscriptions row for this user.",
      },
    }
  }

  const stripeId = subscription.stripe_subscription_id?.trim() || null
  let stripeVerifiedStatus: string | null = null
  let stripeTrialEnd: string | null = null
  let stripeCurrentPeriodEnd: string | null = null
  let stripeRetrieveError: string | null = null

  if (stripeId) {
    const live = await retrieveStripeSubscriptionStatus(stripeId)
    stripeVerifiedStatus = live.status
    stripeTrialEnd = live.trialEnd
    stripeCurrentPeriodEnd = live.currentPeriodEnd
    stripeRetrieveError = live.error ?? null
  }

  const decision = decideEntitlement(
    {
      rawDatabaseStatus: subscription.status,
      trialEnd: subscription.trial_end,
      stripeSubscriptionIdPresent: Boolean(stripeId),
      stripeVerifiedStatus,
      stripeTrialEnd,
      stripeCurrentPeriodEnd,
      stripeRetrieveError,
    },
    nowMs
  )

  if (decision.shouldPersistExpired) {
    await persistExpiredCorrection(userId, subscription)
  }

  const status = decision.status as EntitlementStatus
  return {
    allowed: decision.allowed,
    status,
    statusLabel: statusLabelFor(status),
    displayPeriodEnd: decision.displayPeriodEnd,
    trialEnd: stripeTrialEnd || subscription.trial_end,
    reason: decision.allowed ? "active" : "inactive",
    adminOverride: false,
    ownerOverride: false,
    stripeSubscriptionId: stripeId,
    subscription,
    debug: {
      rawDatabaseStatus: subscription.status,
      trialEnd: subscription.trial_end,
      stripeSubscriptionIdPresent: Boolean(stripeId),
      stripeVerifiedStatus,
      finalEntitlement: status,
      decidingField: decision.decidingField,
      summary: decision.summary,
    },
  }
}
