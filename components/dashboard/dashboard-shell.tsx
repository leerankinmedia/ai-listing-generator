"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Share2,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Plug,
} from "lucide-react"
import { useState } from "react"
import { Logo } from "@/components/layout/logo"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@/lib/types"

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard#inventory", label: "Inventory", icon: Package, soon: true },
  { href: "/dashboard#channels", label: "Channels", icon: Plug, soon: true },
  { href: "/dashboard#crosslist", label: "Crosslist", icon: Share2, soon: true },
  { href: "/dashboard#analytics", label: "Analytics", icon: BarChart3, soon: true },
  { href: "/dashboard#settings", label: "Settings", icon: Settings, soon: true },
]

export function DashboardShell({
  user,
  isDemo,
  children,
}: {
  user: UserProfile
  isDemo: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" size="sm" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href && !item.soon
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--lw-accent)]/15 text-[var(--lw-accent)]"
                  : "text-[var(--lw-fg-muted)] hover:bg-[var(--lw-surface-2)] hover:text-[var(--lw-fg)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.soon ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--lw-fg-subtle)]">
                  Soon
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-[var(--lw-border)] p-4">
        <p className="truncate text-sm font-semibold text-[var(--lw-fg)]">
          {user.fullName || "Seller"}
        </p>
        <p className="truncate text-xs text-[var(--lw-fg-subtle)]">{user.email}</p>
        {isDemo ? (
          <p className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            Demo mode — add Supabase env to go live
          </p>
        ) : null}
        <Button
          variant="ghost"
          className="mt-3 w-full justify-start"
          onClick={logout}
          disabled={loggingOut}
        >
          <LogOut />
          {loggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-[100svh] bg-[var(--lw-bg)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--lw-border)] bg-[var(--lw-surface)]/80 backdrop-blur-md lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close sidebar"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-[var(--lw-border)] bg-[var(--lw-bg)] shadow-xl">
            <div className="absolute right-3 top-3">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--lw-border)] bg-[var(--lw-bg)]/90 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <p className="hidden text-sm font-medium text-[var(--lw-fg-muted)] sm:block lg:block">
            Workspace
          </p>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
