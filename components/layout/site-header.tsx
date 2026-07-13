"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button, buttonVariants } from "@/components/ui/button"
import { useAuth } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"

const links = [
  { href: "#features", label: "Features" },
  { href: "#marketplaces", label: "Marketplaces" },
  { href: "#how-it-works", label: "How it works" },
]

export function SiteHeader() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-border/80 bg-background/80 backdrop-blur-xl"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {user ? (
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "accent" }))}
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost" }))}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={cn(buttonVariants({ variant: "accent" }))}
              >
                Start free
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-border bg-background/95 px-4 py-4 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              {user ? (
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-semibold text-accent-foreground"
                  onClick={() => setOpen(false)}
                >
                  Open dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg px-3 py-2.5 text-center text-sm font-medium hover:bg-secondary"
                    onClick={() => setOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-accent px-3 py-2.5 text-center text-sm font-semibold text-accent-foreground"
                    onClick={() => setOpen(false)}
                  >
                    Start free
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
