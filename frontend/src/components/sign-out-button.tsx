'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  const supabase = createClient()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground hover:text-foreground">
      <LogOut className="w-4 h-4" />
      Sign out
    </Button>
  )
}
