"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { loadStripe } from "@stripe/stripe-js"
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js"
import { Loader2 } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/components/auth/auth-provider"
import { useBillingStatus } from "@/components/billing/paywall"
import { buttonVariants } from "@/components/ui/button"
import {
  BILLING_TRIAL_DAYS,
  getMembershipPriceLabel,
  PLAN_NAME,
} from "@/lib/billing/config"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || ""
}

export function EmbeddedCheckoutPage() {
  const { user, loading: authLoading } = useAuth()
  const { status, loading: billingLoading } = useBillingStatus(Boolean(user))
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const publishableKey = getPublishableKey()
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  )

  const createSession = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start checkout")
      }
      setClientSecret(data.clientSecret as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
      setClientSecret(null)
    } finally {
      setCreating(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login?next=/checkout")
      return
    }
    if (billingLoading) return
    if (status?.unlocksApp) {
      // Already trialing/active — do not start another checkout
      return
    }
    if (!clientSecret && !creating && !error) {
      void createSession()
    }
  }, [
    authLoading,
    user,
    billingLoading,
    status?.unlocksApp,
    clientSecret,
    creating,
    error,
    createSession,
    router,
  ])

  if (authLoading || (user && billingLoading)) {
    return (
      <CheckoutShell>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading checkout…
        </p>
      </CheckoutShell>
    )
  }

  if (!user) {
    return (
      <CheckoutShell>
        <p className="text-sm text-muted-foreground">Redirecting to log in…</p>
      </CheckoutShell>
    )
  }

  if (status?.unlocksApp) {
    return (
      <CheckoutShell>
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            You&apos;re already on {status.planName || PLAN_NAME}
          </h1>
          <p className="text-sm text-muted-foreground">
            Status: {status.status}. You can&apos;t start another trial while
            this subscription is active.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "accent" }))}
            >
              Go to dashboard
            </Link>
            <Link
              href="/billing"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Manage billing
            </Link>
          </div>
        </div>
      </CheckoutShell>
    )
  }

  if (!publishableKey) {
    return (
      <CheckoutShell>
        <p className="text-sm text-destructive" role="alert">
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing. Add the Stripe
          publishable key to continue.
        </p>
      </CheckoutShell>
    )
  }

  return (
    <CheckoutShell>
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            {PLAN_NAME}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
            Secure checkout
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {getMembershipPriceLabel()} · {BILLING_TRIAL_DAYS}-day free trial ·
            payment method required to start
          </p>
        </div>

        {error && (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              onClick={() => void createSession()}
            >
              Try again
            </button>
          </div>
        )}

        {(creating || (!clientSecret && !error)) && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing secure checkout…
          </p>
        )}

        {clientSecret && stripePromise && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card/90 p-2 sm:p-4">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/pricing" className="hover:text-foreground">
            Back to pricing
          </Link>
          {" · "}
          <Link href="/billing" className="hover:text-foreground">
            Billing
          </Link>
        </p>
      </div>
    </CheckoutShell>
  )
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 justify-center px-4 pb-16 pt-2">{children}</div>
    </div>
  )
}
