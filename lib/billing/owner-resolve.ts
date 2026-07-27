import "server-only"
import {
  authUserHasOwnerEmail,
  isListWiseOwnerEmail,
  isOwnerUserId,
} from "@/lib/billing/owner"
import { createServiceRoleClient } from "@/lib/supabase/index"

export type OwnerResolveUser = {
  id: string
  email?: string | null
  new_email?: string | null
  user_metadata?: Record<string, unknown> | null
  identities?: Array<{
    identity_data?: Record<string, unknown> | null
    email?: string | null
  }> | null
}

export type OwnerResolveDebug = {
  userId: string
  sessionEmail: string | null
  isOwner: boolean
  via:
    | "owner_user_id"
    | "session_email"
    | "auth_admin"
    | "profiles_email"
    | "none"
  serviceRoleAvailable: boolean
}

/**
 * Resolve whether this authenticated user is the permanent Owner.
 * Checks session emails, optional owner user-id allow-list, Auth Admin, and profiles.
 * Must run before any subscription / trial enforcement.
 */
export async function resolveIsPermanentOwner(
  user: OwnerResolveUser | null | undefined
): Promise<boolean> {
  const result = await resolveIsPermanentOwnerDetailed(user)
  return result.isOwner
}

/** Same as resolveIsPermanentOwner with a structured decision trace. */
export async function resolveIsPermanentOwnerDetailed(
  user: OwnerResolveUser | null | undefined
): Promise<OwnerResolveDebug> {
  if (!user?.id) {
    return {
      userId: "",
      sessionEmail: null,
      isOwner: false,
      via: "none",
      serviceRoleAvailable: false,
    }
  }

  const sessionEmail =
    typeof user.email === "string" && user.email.trim()
      ? user.email.trim()
      : null

  if (isOwnerUserId(user.id)) {
    return {
      userId: user.id,
      sessionEmail,
      isOwner: true,
      via: "owner_user_id",
      serviceRoleAvailable: Boolean(createServiceRoleClient()),
    }
  }

  if (authUserHasOwnerEmail(user)) {
    return {
      userId: user.id,
      sessionEmail,
      isOwner: true,
      via: "session_email",
      serviceRoleAvailable: Boolean(createServiceRoleClient()),
    }
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return {
      userId: user.id,
      sessionEmail,
      isOwner: false,
      via: "none",
      serviceRoleAvailable: false,
    }
  }

  try {
    const { data, error } = await admin.auth.admin.getUserById(user.id)
    if (!error && data?.user && authUserHasOwnerEmail(data.user)) {
      return {
        userId: user.id,
        sessionEmail,
        isOwner: true,
        via: "auth_admin",
        serviceRoleAvailable: true,
      }
    }
  } catch {
    // continue to profiles
  }

  try {
    const { data, error } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle()
    if (!error && isListWiseOwnerEmail(data?.email as string | undefined)) {
      return {
        userId: user.id,
        sessionEmail,
        isOwner: true,
        via: "profiles_email",
        serviceRoleAvailable: true,
      }
    }
  } catch {
    // ignore
  }

  return {
    userId: user.id,
    sessionEmail,
    isOwner: false,
    via: "none",
    serviceRoleAvailable: true,
  }
}
