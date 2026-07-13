"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Store,
  Zap,
} from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard#listings", label: "Listings", icon: Package },
  { href: "/dashboard#marketplaces", label: "Marketplaces", icon: Store },
  { href: "/dashboard#inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard#automation", label: "Automation", icon: Zap },
  { href: "/dashboard#analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard#settings", label: "Settings", icon: Settings },
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut, isDemo } = useAuth()

  async function handleSignOut() {
    await signOut()
    router.push("/")
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex h-16 items-center px-5">
          <Logo className="[&_span:last-child]:text-sidebar-foreground" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.href === "/dashboard" && pathname === "/dashboard"
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 truncate px-1 text-xs text-sidebar-muted">
            {user?.email}
            {isDemo && (
              <span className="mt-1 block text-[10px] uppercase tracking-wider text-accent">
                Demo mode
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:h-16">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo />
          </div>
          <p className="hidden text-sm text-muted-foreground lg:block">
            Sell smarter across every marketplace.
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
            >
              Sign out
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
