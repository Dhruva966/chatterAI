import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { LocationPermissionBanner } from '@/components/location-permission-banner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName: string = user.user_metadata?.full_name || ''
  const initials = fullName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        tasks={[]}
        user={{ name: fullName || user.email || 'User', email: user.email || '', initials }}
      />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
      <LocationPermissionBanner />
    </div>
  )
}
