'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Phone, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type CallResult = { id: string; description: string }

export default function BatchPage() {
  const router = useRouter()
  const supabase = createClient()
  const [calls, setCalls] = useState(['', ''])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CallResult[]>([])

  const addCall = () => setCalls(prev => [...prev, ''])
  const removeCall = (idx: number) => setCalls(prev => prev.filter((_, i) => i !== idx))
  const updateCall = (idx: number, val: string) =>
    setCalls(prev => prev.map((c, i) => (i === idx ? val : c)))

  const filledCalls = calls.filter(c => c.trim())

  const handleStart = async () => {
    if (!filledCalls.length) return
    setLoading(true)
    const ids: CallResult[] = []

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      for (const desc of filledCalls) {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ request: desc }),
          })
          if (!res.ok) throw new Error(await res.text())
          const task = await res.json()
          ids.push({ id: task.id, description: desc })
        } catch (err) {
          console.error('Call failed:', err)
          toast.error(`Failed to start: "${desc.slice(0, 40)}…"`)
        }
      }
    } finally {
      setLoading(false)
    }

    if (ids.length === 1) {
      router.push(`/tasks/${ids[0].id}`)
      return
    }

    if (ids.length > 1) setResults(ids)
  }

  if (results.length > 0) {
    return (
      <div className="px-6 py-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-bold tracking-tight">Calls started</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {results.length} calls are now in progress.
        </p>
        <div className="space-y-2">
          {results.map((r, i) => (
            <Link
              key={r.id}
              href={`/tasks/${r.id}`}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/50 hover:border-border transition-colors text-sm"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="flex-1 truncate text-foreground/80">{r.description}</span>
              <span className="text-xs text-muted-foreground shrink-0">View →</span>
            </Link>
          ))}
        </div>
        <button
          onClick={() => { setResults([]); setCalls(['', '']) }}
          className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Start another batch
        </button>
      </div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">Batch Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schedule multiple calls at once — all start simultaneously.
        </p>
      </div>

      <div className="space-y-3">
        {calls.map((call, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <div className="flex-1 relative">
              <span className="absolute left-3.5 top-3.5 text-[11px] text-muted-foreground/40 font-medium tabular-nums select-none">
                {idx + 1}
              </span>
              <textarea
                value={call}
                onChange={e => updateCall(idx, e.target.value)}
                placeholder={
                  idx === 0
                    ? 'e.g. Call the dentist and book a cleaning for next week'
                    : idx === 1
                    ? 'e.g. Call Comcast and ask about lowering my bill'
                    : 'e.g. Make a restaurant reservation for 2 at 7pm'
                }
                className={cn(
                  'w-full bg-card border border-border/60 rounded-xl pl-8 pr-4 py-3 text-sm text-foreground',
                  'resize-none min-h-[60px] placeholder:text-muted-foreground/35',
                  'focus:outline-none focus:border-primary/50 transition-colors'
                )}
                rows={2}
              />
            </div>
            {calls.length > 1 && (
              <button
                onClick={() => removeCall(idx)}
                className="mt-3.5 p-1.5 text-muted-foreground/30 hover:text-muted-foreground rounded-lg hover:bg-white/5 transition-colors shrink-0"
                title="Remove"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addCall}
        className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-1.5"
      >
        <Plus className="w-4 h-4" />
        Add another call
      </button>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleStart}
          disabled={loading || filledCalls.length === 0}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
            filledCalls.length > 0 && !loading
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90'
              : 'bg-white/5 text-muted-foreground cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Phone className="w-4 h-4" />
          )}
          {loading
            ? 'Starting calls…'
            : `Start ${filledCalls.length} call${filledCalls.length !== 1 ? 's' : ''}`}
        </button>
        <p className="text-xs text-muted-foreground">
          {filledCalls.length} of {calls.length} filled
        </p>
      </div>
    </div>
  )
}
