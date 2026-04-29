'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const supabase = createClient()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (iconOnly) {
    return (
      <button
        onClick={signOut}
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors"
        title="Sign out"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    )
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground hover:text-foreground">
      <LogOut className="w-4 h-4" />
      Sign out
    </Button>
  )
}
