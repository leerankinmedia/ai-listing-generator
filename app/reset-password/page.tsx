import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { ThemeToggle } from "@/components/theme-toggle"

export const metadata: Metadata = {
  title: "Reset password",
}

export default function ResetPasswordPage() {
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
              Choose a new password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter and confirm a new password for your ListWise account.
            </p>
          </div>
          <ResetPasswordForm />
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
