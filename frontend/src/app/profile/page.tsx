import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PersonalContextForm } from '@/components/personal-context-form'
import { SavedPresets } from '@/components/saved-presets'
import { SignOutButton } from '@/components/sign-out-button'
import { Separator } from '@/components/ui/separator'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: presets } = await supabase
    .from('saved_presets').select('*').eq('user_id', user.id).order('created_at', { ascending: true })

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-medium">Profile</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        {/* Account info */}
        <div className="space-y-1">
          <p className="font-medium">{user.user_metadata?.full_name || 'Your account'}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        <Separator className="bg-border/50" />

        {/* Personal context */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-medium">Personal context</h2>
            <p className="text-sm text-muted-foreground">
              The AI uses this info when making calls on your behalf — name, account numbers, preferences.
            </p>
          </div>
          <PersonalContextForm
            userId={user.id}
            initialContext={profile?.personal_context || {}}
          />
        </section>

        <Separator className="bg-border/50" />

        {/* Saved presets */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-medium">Saved presets</h2>
            <p className="text-sm text-muted-foreground">
              Quick-fill templates for calls you make often.
            </p>
          </div>
          <SavedPresets userId={user.id} initialPresets={presets || []} />
        </section>

        <Separator className="bg-border/50" />

        <div className="pb-4">
          <SignOutButton />
        </div>
      </main>
    </div>
  )
}
