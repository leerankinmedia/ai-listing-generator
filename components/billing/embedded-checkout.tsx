"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  BILLING_TRIAL_DAYS,
  getMembershipPriceLabel,
  PLAN_NAME,
} from "@/lib/billing/config"
import { getEmailValidationError } from "@/lib/auth/email"
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
  const [needsBillingEmail, setNeedsBillingEmail] = useState(false)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [billingEmail, setBillingEmail] = useState("")
  const [confirmBillingEmail, setConfirmBillingEmail] = useState("")

  const publishableKey = getPublishableKey()
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  )

  const createSession = useCallback(
    async (payload?: {
      billingEmail: string
      confirmBillingEmail: string
    }) => {
      setCreating(true)
      setError(null)
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload ?? {}),
        })
        const data = await res.json()
        if (res.status === 422 && data.code === "invalid_billing_email") {
          setNeedsBillingEmail(true)
          setCurrentEmail(
            typeof data.currentEmail === "string" ? data.currentEmail : null
          )
          setClientSecret(null)
          setError(data.error || "Enter a valid billing email to continue.")
          return
        }
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Could not start checkout")
        }
        setNeedsBillingEmail(false)
        setClientSecret(data.clientSecret as string)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed")
        setClientSecret(null)
      } finally {
        setCreating(false)
      }
    },
    []
  )

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login?next=/checkout")
      return
    }
    if (billingLoading) return
    if (status?.unlocksApp) {
      return
    }
    if (!clientSecret && !creating && !error && !needsBillingEmail) {
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
    needsBillingEmail,
    createSession,
    router,
  ])

  async function onSubmitBillingEmail(e: FormEvent) {
    e.preventDefault()
    const emailError = getEmailValidationError(billingEmail)
    if (emailError) {
      setError(emailError)
      return
    }
    if (billingEmail.trim().toLowerCase() !== confirmBillingEmail.trim().toLowerCase()) {
      setError("Billing email and confirmation do not match.")
      return
    }
    await createSession({
      billingEmail: billingEmail.trim(),
      confirmBillingEmail: confirmBillingEmail.trim(),
    })
  }

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

        {needsBillingEmail && (
          <form
            onSubmit={(e) => void onSubmitBillingEmail(e)}
            className="space-y-4 rounded-2xl border border-border bg-card/90 p-5 sm:p-6"
          >
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Confirm your billing email
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account email
                {currentEmail ? (
                  <>
                    {" "}
                    (<span className="font-medium text-foreground">
                      ({currentEmail})
                    </span>
                  </>
                ) : null}{" "}
                isn&apos;t valid for Stripe. Enter a correct email to continue —
                we&apos;ll update your ListWise profile, then start checkout.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingEmail">Billing email</Label>
              <Input
                id="billingEmail"
                type="email"
                autoComplete="email"
                required
                placeholder="you@shop.com"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmBillingEmail">Confirm billing email</Label>
              <Input
                id="confirmBillingEmail"
                type="email"
                autoComplete="email"
                required
                placeholder="you@shop.com"
                value={confirmBillingEmail}
                onChange={(e) => setConfirmBillingEmail(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="accent"
              className="w-full"
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Updating and starting checkout…
                </>
              ) : (
                "Save email and continue"
              )}
            </Button>
          </form>
        )}

        {!needsBillingEmail && error && (
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

        {!needsBillingEmail && (creating || (!clientSecret && !error)) && (
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
