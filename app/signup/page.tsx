import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { SignupForm } from "@/components/auth/signup-form"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Sign up",
}

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="animate-rise w-full max-w-md rounded-2xl border border-border bg-card/90 p-6 shadow-[0_24px_60px_-40px_rgba(10,15,26,0.45)] backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Create your ListWise account
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Start crosslisting smarter in under a minute.
            </p>
          </div>
          <SignupForm />
        </div>
      </div>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← Back to home
        </Link>
      </p>
    </div>
  )
}
