"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Store,
  X,
} from "lucide-react"
import { Logo } from "@/components/branding/logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/auth/actions"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard#inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard#marketplaces", label: "Marketplaces", icon: Store },
  { href: "/dashboard#analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard#settings", label: "Settings", icon: Settings },
]

export function DashboardShell({
  userName,
  userEmail,
  children,
}: {
  userName: string
  userEmail: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = item.href === "/dashboard" && pathname === "/dashboard"
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--lw-accent)]/12 text-[var(--lw-accent)]"
                : "text-[var(--lw-fg-muted)] hover:bg-[var(--lw-surface-hover)] hover:text-[var(--lw-fg)]"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[var(--lw-bg)] text-[var(--lw-fg)]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--lw-border)] bg-[var(--lw-surface)] p-4 lg:flex">
          <Link href="/" className="mb-8 px-1">
            <Logo />
          </Link>
          <NavLinks />
          <div className="mt-auto space-y-3 border-t border-[var(--lw-border)] pt-4">
            <div className="px-1">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="truncate text-xs text-[var(--lw-fg-subtle)]">
                {userEmail}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={signOut} className="flex-1">
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--lw-border)] bg-[var(--lw-bg)]/85 px-4 backdrop-blur-xl lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
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
          </header>

          {open && (
            <div className="border-b border-[var(--lw-border)] bg-[var(--lw-surface)] p-4 lg:hidden animate-fade-in">
              <NavLinks onNavigate={() => setOpen(false)} />
              <form action={signOut} className="mt-3">
                <Button type="submit" variant="secondary" className="w-full">
                  Sign out
                </Button>
              </form>
            </div>
          )}

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
