"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Link2,
  Settings,
  Sparkles,
  Store,
} from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard#inventory", label: "Inventory", icon: Boxes, soon: true },
  { href: "/dashboard#ai", label: "AI Listings", icon: Sparkles, soon: true },
  { href: "/dashboard#crosslist", label: "Crosslist", icon: Link2, soon: true },
  { href: "/dashboard#marketplaces", label: "Marketplaces", icon: Store },
  { href: "/dashboard#analytics", label: "Analytics", icon: BarChart3, soon: true },
  { href: "/dashboard#settings", label: "Settings", icon: Settings, soon: true },
]

export function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode
  email?: string
}) {
  const pathname = usePathname()

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh max-w-[1400px]">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border/70 bg-card/40 px-4 py-5 lg:flex">
          <Logo size="sm" href="/dashboard" />
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const active = item.href === "/dashboard" && pathname === "/dashboard"
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {item.soon && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="space-y-3 border-t border-border/70 pt-4">
            <p className="truncate px-1 text-xs text-muted-foreground">
              {email || "demo@listwise.app"}
            </p>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
            <Logo size="sm" href="/dashboard" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </header>

          <nav className="flex gap-2 overflow-x-auto border-b border-border/70 px-4 py-2 lg:hidden">
            {nav.slice(0, 5).map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="shrink-0 rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
