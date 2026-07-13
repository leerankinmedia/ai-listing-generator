"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client"

const DEMO_COOKIE = "listwise_demo_session"

export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    if (isSupabaseConfigured()) {
      const supabase = createClient()
      await supabase.auth.signOut()
    } else {
      document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    }
    router.push("/")
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </Button>
  )
}
