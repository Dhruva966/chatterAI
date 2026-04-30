'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, ChevronLeft, ChevronRight, Download, Upload,
  Info, Minus, Plus, Clock, CheckCircle2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type View = 'list' | 'create'
type SendTime = 'now' | 'schedule'
type Result = { id: string; description: string }

export default function BatchPage() {
  const router = useRouter()
  const supabase = createClient()

  const [view, setView] = useState<View>('list')
  const [batchName, setBatchName] = useState('')
  const [sendTime, setSendTime] = useState<SendTime>('now')
  const [concurrency, setConcurrency] = useState(5)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Result[]>([])

  const handleSend = async () => {
    if (!batchName.trim()) { toast.error('Enter a batch call name'); return }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ request: batchName }),
      })
      if (!res.ok) throw new Error(await res.text())
      const task = await res.json()
      setResults([{ id: task.id, description: batchName }])
    } catch (err) {
      console.error(err)
      toast.error('Failed to start batch call')
    } finally {
      setLoading(false)
    }
  }

  if (results.length > 0) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <h1 className="text-xl font-bold">Batch call started</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">{results.length} call{results.length !== 1 ? 's' : ''} in progress.</p>
        <div className="space-y-2">
          {results.map(r => (
            <Link key={r.id} href={`/tasks/${r.id}`}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/50 hover:border-border transition-colors text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="flex-1 truncate text-foreground/80">{r.description}</span>
              <span className="text-xs text-muted-foreground shrink-0">View →</span>
            </Link>
          ))}
        </div>
        <button onClick={() => { setResults([]); setView('list') }}
          className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Batch Calls
        </button>
      </div>
    )
  }

  if (view === 'list') {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">Batch Call</h1>
          </div>
          <button onClick={() => setView('create')}
            className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
            Create a batch call
          </button>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-14 h-14 rounded-xl border border-border flex items-center justify-center bg-muted/20">
            <Phone className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">You don't have any batch call</p>
        </div>
      </div>
    )
  }

  // Create view — two-panel layout
  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-[480px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
        <div className="px-6 pt-6 pb-4">
          <button onClick={() => setView('list')}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted/40 transition-colors mb-4">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">Create a batch call</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Info className="w-3 h-3" />
            Batch call cost $0.005 per dial
          </p>
        </div>

        <div className="px-6 space-y-5 pb-8">
          {/* Batch Call Name */}
          <div>
            <label className="text-sm font-medium block mb-1.5">Batch Call Name</label>
            <input type="text" value={batchName} onChange={e => setBatchName(e.target.value)}
              placeholder="Enter"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40" />
          </div>

          {/* From number */}
          <div>
            <label className="text-sm font-medium block mb-1.5">From number</label>
            <div className="relative">
              <select className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50 text-muted-foreground">
                <option value="">Select a number</option>
              </select>
              <ChevronRight className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground rotate-90 pointer-events-none" />
            </div>
          </div>

          {/* Upload Recipients */}
          <div>
            <label className="text-sm font-medium block mb-2">Upload Recipients</label>
            <button className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 mb-2 hover:bg-muted/30 transition-colors text-muted-foreground">
              <Download className="w-3.5 h-3.5" />
              Download the template
            </button>
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-xl py-8 cursor-pointer hover:bg-muted/20 transition-colors text-center">
              <Upload className="w-5 h-5 text-muted-foreground/40" />
              <span className="text-sm text-muted-foreground">
                {csvFile ? csvFile.name : 'Choose a csv or drag & drop it here.'}
              </span>
              <span className="text-xs text-muted-foreground/50">Up to 50 MB</span>
              <input type="file" accept=".csv" className="hidden"
                onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {/* When to send */}
          <div>
            <label className="text-sm font-medium block mb-2">When to send the calls</label>
            <div className="flex gap-2">
              {(['now', 'schedule'] as const).map(opt => (
                <button key={opt} onClick={() => setSendTime(opt)}
                  className={cn(
                    'flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border text-sm transition-colors',
                    sendTime === opt
                      ? 'border-primary/60 bg-primary/5 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted/30'
                  )}>
                  <span className={cn('w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                    sendTime === opt ? 'border-primary' : 'border-muted-foreground/40')}>
                    {sendTime === opt && <span className="w-1.5 h-1.5 rounded-full bg-primary block" />}
                  </span>
                  {opt === 'now' ? 'Send Now' : 'Schedule'}
                </button>
              ))}
            </div>
          </div>

          {/* When Calls Can Run */}
          <button className="flex items-center justify-between w-full text-sm hover:opacity-70 transition-opacity py-0.5">
            <span className="font-medium">When Calls Can Run</span>
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Clock className="w-3.5 h-3.5" />
              00:00–23:59, Mon–Sun
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Reserved Concurrency */}
          <div>
            <p className="text-sm font-medium">Reserved Concurrency for Other Calls</p>
            <p className="text-xs text-muted-foreground mt-0.5">Number of concurrency reserved for all other calls, such as inbound calls.</p>
            <div className="flex items-center gap-4 mt-3">
              <button onClick={() => setConcurrency(c => Math.max(0, c - 1))}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted/30 transition-colors">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium w-4 text-center tabular-nums">{concurrency}</span>
              <button onClick={() => setConcurrency(c => c + 1)}
                className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted/30 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 text-xs space-y-1">
              <p className="font-medium text-blue-600 dark:text-blue-400">Concurrency allocated to batch calling: 15</p>
              <p className="text-blue-500/80 flex items-center gap-0.5 cursor-pointer hover:underline">
                Purchase more concurrency <span className="ml-0.5">↗</span>
              </p>
            </div>
          </div>

          {/* Terms */}
          <p className="text-xs text-muted-foreground">
            You've read and agree with the{' '}
            <span className="text-primary cursor-pointer hover:underline">Terms of service</span>.
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => toast.info('Draft saved')}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors">
              Save as draft
            </button>
            <button onClick={handleSend} disabled={loading}
              className={cn(
                'px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-foreground text-background transition-opacity',
                loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
              )}>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Recipients</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Please upload recipients first</p>
        </div>
      </div>
    </div>
  )
}
