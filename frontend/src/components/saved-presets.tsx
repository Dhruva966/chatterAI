'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'

type Preset = { id: string; name: string; request_template: string }

export function SavedPresets({
  userId,
  initialPresets,
}: {
  userId: string
  initialPresets: Preset[]
}) {
  const [presets, setPresets] = useState<Preset[]>(initialPresets)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const supabase = createClient()

  async function addPreset(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !template.trim()) return
    setAdding(true)
    const { data, error } = await supabase
      .from('saved_presets')
      .insert({ user_id: userId, name: name.trim(), request_template: template.trim() })
      .select().single()
    if (error) {
      toast.error('Failed to save preset')
    } else {
      setPresets([...presets, data])
      setName('')
      setTemplate('')
      setShowForm(false)
      toast.success('Preset saved')
    }
    setAdding(false)
  }

  async function deletePreset(id: string) {
    const { error } = await supabase.from('saved_presets').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete')
    } else {
      setPresets(presets.filter(p => p.id !== id))
    }
  }

  return (
    <div className="space-y-3">
      {presets.map((preset) => (
        <Card key={preset.id} className="border-border/50 rounded-xl">
          <CardContent className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{preset.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preset.request_template}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/new?preset=${encodeURIComponent(preset.request_template)}`}>
                <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs">Use</Button>
              </Link>
              <Button
                variant="ghost" size="sm"
                onClick={() => deletePreset(preset.id)}
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {showForm ? (
        <form onSubmit={addPreset} className="space-y-3 p-4 rounded-xl border border-border/50 bg-muted/30">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name (e.g. 'My Chipotle order')"
            className="rounded-xl h-9 text-sm"
            required
          />
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Call Chipotle and order a burrito bowl with chicken..."
            className="rounded-xl resize-none text-sm min-h-20"
            required
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={adding} size="sm" className="rounded-xl gap-2">
              {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save preset
            </Button>
            <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline" size="sm"
          onClick={() => setShowForm(true)}
          className="rounded-xl gap-2 border-dashed"
        >
          <Plus className="w-3.5 h-3.5" />
          Add preset
        </Button>
      )}
    </div>
  )
}
