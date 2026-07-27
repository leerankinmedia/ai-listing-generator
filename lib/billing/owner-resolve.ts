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

/**
 * Resolve whether this authenticated user is the permanent Owner.
 * Checks session emails, optional owner user-id allow-list, Auth Admin, and profiles.
 * Must run before any subscription / trial enforcement.
 */
export async function resolveIsPermanentOwner(
  user: OwnerResolveUser | null | undefined
): Promise<boolean> {
  if (!user?.id) return false

  if (isOwnerUserId(user.id)) return true
  if (authUserHasOwnerEmail(user)) return true

  const admin = createServiceRoleClient()
  if (!admin) return false

  try {
    const { data, error } = await admin.auth.admin.getUserById(user.id)
    if (!error && data?.user && authUserHasOwnerEmail(data.user)) {
      return true
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
      return true
    }
  } catch {
    // ignore
  }

  return false
}
