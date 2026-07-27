import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  isSupabaseAuthCookieName,
  listKnownSupabaseAuthCookieNames,
} from "@/lib/supabase/auth-cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
}

function supabaseCookieOptions(maxAge: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    maxAge,
  }
}

function clearAuthCookiesOnResponse(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  response: NextResponse
) {
  const names = new Set<string>(listKnownSupabaseAuthCookieNames())
  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) names.add(cookie.name)
  }

  const cleared = supabaseCookieOptions(0)
  for (const name of names) {
    try {
      cookieStore.set(name, "", cleared)
    } catch {
      // ignore
    }
    response.cookies.set(name, "", cleared)
  }
}

function createCookieClient(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  response: NextResponse
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error("Supabase is not configured.")
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // ignore
          }
          response.cookies.set(name, value, options)
        })
      },
    },
  })
}

function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
}

/**
 * DELETE /api/auth/session
 * Invalidate the current auth session and expire every sb-*-auth-* cookie.
 */
export async function DELETE() {
  const cookieStore = await cookies()
  const response = NextResponse.json(
    { ok: true, cleared: true },
    { headers: NO_STORE }
  )

  try {
    const supabase = createCookieClient(cookieStore, response)
    await supabase.auth.signOut({ scope: "global" })
  } catch {
    // still clear cookies below
  }

  clearAuthCookiesOnResponse(cookieStore, response)
  return response
}

type SessionBody = {
  access_token?: string
  refresh_token?: string
}

/**
 * POST /api/auth/session
 * Clear any prior auth cookies, then rebuild the cookie jar from scratch
 * using the provided access/refresh tokens.
 */
export async function POST(request: Request) {
  let body: SessionBody
  try {
    body = (await request.json()) as SessionBody
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: NO_STORE }
    )
  }

  const access_token = body.access_token?.trim()
  const refresh_token = body.refresh_token?.trim()
  if (!access_token || !refresh_token) {
    return NextResponse.json(
      { error: "access_token and refresh_token are required." },
      { status: 400, headers: NO_STORE }
    )
  }

  const cookieStore = await cookies()
  const cookieResponse = NextResponse.json({ ok: false }, { headers: NO_STORE })

  clearAuthCookiesOnResponse(cookieStore, cookieResponse)

  const supabase = createCookieClient(cookieStore, cookieResponse)
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  })
  if (error || !data.session?.user) {
    const failure = NextResponse.json(
      {
        ok: false,
        error: error?.message || "Could not establish auth session cookies.",
      },
      { status: 401, headers: NO_STORE }
    )
    copyCookies(cookieResponse, failure)
    return failure
  }

  const success = NextResponse.json(
    {
      ok: true,
      user: {
        id: data.session.user.id,
        email: data.session.user.email ?? null,
      },
    },
    { status: 200, headers: NO_STORE }
  )
  copyCookies(cookieResponse, success)
  return success
}
