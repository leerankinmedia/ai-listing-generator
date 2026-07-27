import "server-only"
import {
  LISTWISE_OWNER_EMAIL,
  authUserHasOwnerEmail,
  collectAuthUserEmails,
  getOwnerEmailWhitelist,
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
  authAdminEmail: string | null
  profileEmail: string | null
  ownerWhitelist: string[]
  ownerUserIdsFromEnv: string[]
  ownerUserIdsResolvedFromEmail: string[]
  isOwner: boolean
  via:
    | "owner_user_id"
    | "session_email"
    | "auth_admin"
    | "profiles_email"
    | "owner_email_user_id"
    | "none"
  serviceRoleAvailable: boolean
  whyFalse: string | null
}

function emptyDebug(
  partial: Partial<OwnerResolveDebug> & Pick<OwnerResolveDebug, "userId">
): OwnerResolveDebug {
  return {
    sessionEmail: null,
    authAdminEmail: null,
    profileEmail: null,
    ownerWhitelist: getOwnerEmailWhitelist(),
    ownerUserIdsFromEnv: [...(process.env.LISTWISE_OWNER_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)],
    ownerUserIdsResolvedFromEmail: [],
    isOwner: false,
    via: "none",
    serviceRoleAvailable: false,
    whyFalse: null,
    ...partial,
  }
}

/**
 * Find every Auth / profiles user id whose email is the Founder whitelist.
 * This binds Owner to the *current* account that owns leerankinmedia@gmail.com,
 * not to any UUID that may have existed before that account was created.
 */
async function resolveOwnerUserIdsByEmail(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>
): Promise<{ ids: string[]; profileEmailById: Map<string, string> }> {
  const ids = new Set<string>()
  const profileEmailById = new Map<string, string>()
  const whitelist = getOwnerEmailWhitelist()

  try {
    const { data: profiles } = await admin.from("profiles").select("id, email")
    for (const row of profiles || []) {
      const id = typeof row.id === "string" ? row.id : ""
      const email = typeof row.email === "string" ? row.email : ""
      if (!id) continue
      if (email) profileEmailById.set(id, email)
      if (isListWiseOwnerEmail(email)) ids.add(id)
    }
  } catch {
    // continue with auth users
  }

  // Exact profile lookup for the hardcoded Founder email (fast path).
  try {
    for (const ownerEmail of whitelist) {
      const { data } = await admin
        .from("profiles")
        .select("id, email")
        .ilike("email", ownerEmail)
        .limit(5)
      for (const row of data || []) {
        if (typeof row.id === "string" && row.id) ids.add(row.id)
      }
    }
  } catch {
    // ilike may be unavailable; ignore
  }

  try {
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      })
      if (error || !data?.users?.length) break
      for (const authUser of data.users) {
        if (authUserHasOwnerEmail(authUser)) ids.add(authUser.id)
      }
      if (data.users.length < 200) break
    }
  } catch {
    // ignore
  }

  return { ids: [...ids], profileEmailById }
}

/**
 * Resolve whether this authenticated user is the permanent Owner.
 * Email (`leerankinmedia@gmail.com`) is the source of truth — optional env
 * UUIDs are additive only and never required.
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
    return emptyDebug({
      userId: "",
      whyFalse: "No authenticated user id.",
    })
  }

  const sessionEmail =
    typeof user.email === "string" && user.email.trim()
      ? user.email.trim()
      : null
  const sessionEmails = collectAuthUserEmails(user)

  const base = emptyDebug({
    userId: user.id,
    sessionEmail,
    serviceRoleAvailable: false,
  })

  if (isOwnerUserId(user.id)) {
    return {
      ...base,
      isOwner: true,
      via: "owner_user_id",
      serviceRoleAvailable: Boolean(createServiceRoleClient()),
      whyFalse: null,
    }
  }

  if (authUserHasOwnerEmail(user) || sessionEmails.some(isListWiseOwnerEmail)) {
    return {
      ...base,
      isOwner: true,
      via: "session_email",
      serviceRoleAvailable: Boolean(createServiceRoleClient()),
      whyFalse: null,
    }
  }

  // Direct equality against the hardcoded Founder email (defense in depth).
  if (
    sessionEmail &&
    isListWiseOwnerEmail(sessionEmail)
  ) {
    return {
      ...base,
      isOwner: true,
      via: "session_email",
      serviceRoleAvailable: Boolean(createServiceRoleClient()),
      whyFalse: null,
    }
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return {
      ...base,
      isOwner: false,
      via: "none",
      serviceRoleAvailable: false,
      whyFalse: `Session emails [${sessionEmails.join(", ") || "(none)"}] did not match ${LISTWISE_OWNER_EMAIL}, and SUPABASE_SERVICE_ROLE_KEY is unavailable for Auth Admin / profiles lookup.`,
    }
  }

  base.serviceRoleAvailable = true

  let authAdminEmail: string | null = null
  try {
    const { data, error } = await admin.auth.admin.getUserById(user.id)
    if (!error && data?.user) {
      authAdminEmail =
        data.user.email ||
        collectAuthUserEmails(data.user)[0] ||
        null
      if (authUserHasOwnerEmail(data.user)) {
        return {
          ...base,
          authAdminEmail,
          profileEmail: null,
          isOwner: true,
          via: "auth_admin",
          serviceRoleAvailable: true,
          whyFalse: null,
        }
      }
    }
  } catch {
    // continue
  }

  let profileEmail: string | null = null
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle()
    if (!error && data?.email) {
      profileEmail = String(data.email)
      if (isListWiseOwnerEmail(profileEmail)) {
        return {
          ...base,
          authAdminEmail,
          profileEmail,
          isOwner: true,
          via: "profiles_email",
          serviceRoleAvailable: true,
          whyFalse: null,
        }
      }
    }
  } catch {
    // continue
  }

  // Bind Owner to whoever currently owns the Founder email in Auth/profiles.
  const { ids: ownerIdsFromEmail, profileEmailById } =
    await resolveOwnerUserIdsByEmail(admin)
  if (!profileEmail && profileEmailById.has(user.id)) {
    profileEmail = profileEmailById.get(user.id) || null
  }

  if (ownerIdsFromEmail.includes(user.id)) {
    return {
      ...base,
      authAdminEmail,
      profileEmail,
      ownerUserIdsResolvedFromEmail: ownerIdsFromEmail,
      isOwner: true,
      via: "owner_email_user_id",
      serviceRoleAvailable: true,
      whyFalse: null,
    }
  }

  return {
    ...base,
    authAdminEmail,
    profileEmail,
    ownerUserIdsResolvedFromEmail: ownerIdsFromEmail,
    isOwner: false,
    via: "none",
    serviceRoleAvailable: true,
    whyFalse: [
      `userId=${user.id}`,
      `sessionEmail=${sessionEmail || "(none)"}`,
      `authAdminEmail=${authAdminEmail || "(none)"}`,
      `profileEmail=${profileEmail || "(none)"}`,
      `whitelist=${getOwnerEmailWhitelist().join(",")}`,
      `ownerUserIdsResolvedFromEmail=[${ownerIdsFromEmail.join(",") || "none"}]`,
      `envOwnerUserIds=[${base.ownerUserIdsFromEnv.join(",") || "none"}]`,
      ownerIdsFromEmail.length === 0
        ? `No Auth/profiles user currently has email ${LISTWISE_OWNER_EMAIL}.`
        : `Current user id is not the Auth/profiles account for ${LISTWISE_OWNER_EMAIL}.`,
    ].join(" | "),
  }
}
