import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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
    .from('saved_presets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">
      <h1 className="text-xl font-bold tracking-tight">Settings</h1>

      {/* Account */}
      <div className="space-y-1">
        <p className="font-medium">{user.user_metadata?.full_name || 'Your account'}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Separator className="bg-border/50" />

      {/* Personal context */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Personal context</h2>
          <p className="text-sm text-muted-foreground">
            The AI uses this info when calling on your behalf — name, account numbers, preferences.
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
          <h2 className="text-base font-semibold">Saved presets</h2>
          <p className="text-sm text-muted-foreground">
            Quick-fill templates for calls you make often.
          </p>
        </div>
        <SavedPresets userId={user.id} initialPresets={presets || []} />
      </section>

      <Separator className="bg-border/50" />

      {/* Billing */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Free plan — billing coming soon.
          </p>
        </div>
        <div className="rounded-xl bg-card border border-border/40 p-5">
          <p className="text-sm font-medium">Free</p>
          <p className="text-xs text-muted-foreground mt-1">Unlimited calls during beta.</p>
        </div>
      </section>

      <Separator className="bg-border/50" />

      <div className="pb-4">
        <SignOutButton />
      </div>
    </div>
  )
}
