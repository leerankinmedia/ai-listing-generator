import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/branding/logo"
import { SignupForm } from "@/components/auth/signup-form"
import { ThemeToggle } from "@/components/theme/theme-toggle"

export const metadata: Metadata = {
  title: "Sign up",
}

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--lw-bg)] text-[var(--lw-fg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 lw-hero-grid opacity-40"
      />
      <header className="relative z-10 flex items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-[var(--lw-border)] bg-[var(--lw-surface)] p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.45)] sm:p-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            Create your ListWise account
          </h1>
          <p className="mt-1.5 text-sm text-[var(--lw-fg-muted)]">
            Start building your multi-channel selling stack.
          </p>
          <div className="mt-7">
            <SignupForm />
          </div>
        </div>
      </main>
    </div>
  )
}
