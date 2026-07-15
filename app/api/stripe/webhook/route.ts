import { handleStripeWebhookPost } from "@/lib/billing/webhook-handler"

export const runtime = "nodejs"

/**
 * Production Stripe webhook endpoint.
 * Endpoint URL: https://ai-listing-generator-n2ji.vercel.app/api/stripe/webhook
 */
export async function POST(request: Request) {
  return handleStripeWebhookPost(request)
}
