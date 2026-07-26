import { NextResponse, after } from "next/server"
import {
  buildEbayDeletionChallengeResponse,
  getEbayDeletionEndpointUrl,
  getEbayDeletionVerificationToken,
  parseEbayDeletionNotification,
} from "@/lib/marketplaces/adapters/ebay/account-deletion"
import { processEbayAccountDeletion } from "@/lib/marketplaces/adapters/ebay/account-deletion-process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Production eBay Marketplace Account Deletion / Closure endpoint.
 * GET  — challenge verification
 * POST — account-deletion notification (ack immediately, then purge data)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const challengeCode = searchParams.get("challenge_code")?.trim() || ""
  const verificationToken = getEbayDeletionVerificationToken()
  const endpointUrl = getEbayDeletionEndpointUrl()

  if (!challengeCode) {
    console.info("[ebay/account-deletion] challenge verification failed", {
      reason: "missing_challenge_code",
    })
    return NextResponse.json(
      { error: "challenge_code is required." },
      { status: 400 }
    )
  }

  if (!verificationToken) {
    console.info("[ebay/account-deletion] challenge verification failed", {
      reason: "missing_verification_token_env",
    })
    return NextResponse.json(
      { error: "EBAY_DELETION_VERIFICATION_TOKEN is not configured." },
      { status: 503 }
    )
  }

  if (!endpointUrl) {
    console.info("[ebay/account-deletion] challenge verification failed", {
      reason: "missing_endpoint_env",
    })
    return NextResponse.json(
      { error: "EBAY_DELETION_ENDPOINT is not configured." },
      { status: 503 }
    )
  }

  try {
    const challengeResponse = buildEbayDeletionChallengeResponse(
      challengeCode,
      verificationToken,
      endpointUrl
    )
    console.info("[ebay/account-deletion] challenge verification success", {
      challengeCodeLength: challengeCode.length,
      endpointConfigured: true,
    })
    return NextResponse.json(
      { challengeResponse },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    console.info("[ebay/account-deletion] challenge verification failed", {
      reason: "hash_error",
      message: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json(
      { error: "Could not build challenge response." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  // Acknowledge immediately; purge runs via after() without delaying the 200.
  let identity: ReturnType<typeof parseEbayDeletionNotification> = {}
  try {
    const raw = await request.text()
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    identity = parseEbayDeletionNotification(parsed)
    console.info("[ebay/account-deletion] notification accepted", {
      hasNotificationId: Boolean(identity.notificationId),
      hasUserId: Boolean(identity.userId),
      hasUsername: Boolean(identity.username),
      topic: identity.topic || null,
    })
  } catch (error) {
    console.info("[ebay/account-deletion] notification parse soft-fail", {
      message: error instanceof Error ? error.message : "unknown",
    })
  }

  after(() => {
    void processEbayAccountDeletion(identity).catch((error) => {
      console.error("[ebay/account-deletion] async process failed", {
        message: error instanceof Error ? error.message : "unknown",
      })
    })
  })

  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  })
}
