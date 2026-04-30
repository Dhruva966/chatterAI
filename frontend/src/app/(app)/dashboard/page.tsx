'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatedAIChat } from '@/components/ui/animated-ai-chat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Zap, Phone, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { statusConfig } from '@/lib/status'
import { toast } from 'sonner'

const GOOEY_PROMPTS = [
  'Make a restaurant reservation for tonight',
  "Schedule a doctor's appointment",
  'Dispute my cable bill',
]

type Task = {
  id: string
  description: string
  business_name: string | null
  phone_number: string | null
  status: string
  created_at: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function DashboardPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [locationHint, setLocationHint] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLocationHint(localStorage.getItem('chatter_location_hint'))
    }
  }, [])

  useEffect(() => {
    async function fetchTasks() {
      const { data } = await supabase
        .from('tasks')
        .select('id, description, business_name, phone_number, status, created_at')
        .order('created_at', { ascending: false })
      setTasks(data || [])
    }
    fetchTasks()
  }, [])

  const handleLocationDetected = useCallback((hint: string) => {
    setLocationHint(hint)
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatter_location_hint', hint)
    }
  }, [])

  const handleSubmit = useCallback(async (value: string) => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ request: value, location_hint: locationHint }),
      })

      if (!res.ok) throw new Error(await res.text())
      const task = await res.json()
      router.push(`/tasks/${task.id}`)
    } catch (err) {
      toast.error('Failed to start call. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [locationHint, router, supabase])

  const totalCalls = tasks.length
  const activeCalls = tasks.filter(t => t.status === 'calling').length
  const completedCalls = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="flex flex-col min-h-full px-8 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">My Calls</h1>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Phone className="w-3 h-3" />
          New Call
        </Button>
      </div>

      {/* Stats row */}
      {totalCalls > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Total Calls', value: totalCalls },
            { label: 'Active',      value: activeCalls },
            { label: 'Completed',   value: completedCalls },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-border/50 bg-card/50 px-4 py-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5">
                {label}
              </p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chat input */}
      <div className="w-full max-w-2xl self-center mb-10">
        <AnimatedAIChat
          onSubmit={handleSubmit}
          loading={loading}
          locationHint={locationHint}
          onLocationDetected={handleLocationDetected}
          showHeading={false}
          animatedPlaceholderTexts={GOOEY_PROMPTS}
        />
      </div>

      {/* Calls table */}
      {tasks.length > 0 ? (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-1/2">
                  Request
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Phone
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Date
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => {
                const cfg = statusConfig[task.status] ?? statusConfig.failed
                return (
                  <tr
                    key={task.id}
                    className={`group border-b border-border/30 hover:bg-white/[0.03] transition-colors last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/5'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotClass}`} />
                        <span className="text-foreground/80 truncate max-w-xs">
                          {task.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs rounded-md px-1.5 py-0.5 border ${cfg.badgeClass}`}
                      >
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground/60 font-mono text-xs">
                      {task.phone_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground/50 text-xs">
                      {timeAgo(task.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${task.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Phone className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground/50">No calls yet.</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            Submit a request above to make your first call.
          </p>
        </div>
      )}
    </div>
  )
}
