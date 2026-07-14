import "server-only"
import Stripe from "stripe"
import { getStripeSecretKey } from "@/lib/billing/config"

let stripeClient: Stripe | null = null

/** Server-only Stripe SDK (test or live key from env — never import in client). */
export function getStripe() {
  const key = getStripeSecretKey()
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.")
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    })
  }
  return stripeClient
}
