import type { Metadata } from "next"
import { Suspense } from "react"
import { CheckoutReturnPage } from "@/components/billing/checkout-return"

export const metadata: Metadata = {
  title: "Checkout complete — ListWise Pro",
}

export default function CheckoutReturnRoute() {
  return (
    <Suspense
      fallback={
        <p className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Confirming checkout…
        </p>
      }
    >
      <CheckoutReturnPage />
    </Suspense>
  )
}
