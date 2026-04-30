'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

type Context = { name?: string; phone?: string; preferences?: string }

export function PersonalContextForm({
  userId,
  initialContext,
}: {
  userId: string
  initialContext: Context
}) {
  const [ctx, setCtx] = useState<Context>(initialContext)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, personal_context: ctx })
    if (error) {
      toast.error('Failed to save')
    } else {
      toast.success('Saved')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Your name</label>
          <Input
            value={ctx.name || ''}
            onChange={(e) => setCtx({ ...ctx, name: e.target.value })}
            placeholder="Alex Johnson"
            className="rounded-xl h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Your phone</label>
          <Input
            value={ctx.phone || ''}
            onChange={(e) => setCtx({ ...ctx, phone: e.target.value })}
            placeholder="+1 (555) 000-0000"
            className="rounded-xl h-9 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">Preferences & account info</label>
        <Textarea
          value={ctx.preferences || ''}
          onChange={(e) => setCtx({ ...ctx, preferences: e.target.value })}
          placeholder="Comcast account #12345678. Prefer appointments in the morning. Allergic to nuts."
          className="rounded-xl resize-none text-sm min-h-24"
        />
      </div>
      <Button type="submit" disabled={saving} size="sm" className="rounded-xl gap-2">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save
      </Button>
    </form>
  )
}
