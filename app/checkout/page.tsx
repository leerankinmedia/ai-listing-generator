import type { Metadata } from "next"
import { EmbeddedCheckoutPage } from "@/components/billing/embedded-checkout"

export const metadata: Metadata = {
  title: "Checkout — ListWise Pro",
}

export default function CheckoutPage() {
  return <EmbeddedCheckoutPage />
}
