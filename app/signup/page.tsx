import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = {
  title: "Sign up",
}

export default function SignupPage() {
  return (
    <div className="relative min-h-svh mesh-bg">
      <div className="absolute inset-0 grid-fade opacity-50" />
      <div className="relative mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo size="sm" />
          <ThemeToggle />
        </div>

        <div className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-xl backdrop-blur sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Create your ListWise account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start crosslisting smarter. Free to get started.
          </p>
          <div className="mt-6">
            <SignupForm />
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
