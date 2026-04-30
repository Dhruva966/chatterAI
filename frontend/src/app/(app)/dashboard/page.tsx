'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatedAIChat } from '@/components/ui/animated-ai-chat'
import { Badge } from '@/components/ui/badge'
import { Zap } from 'lucide-react'
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
        .select('id, description, business_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
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

  const recentTasks = tasks.slice(0, 5)
  const totalCalls = tasks.length

  return (
    <div className="flex flex-col items-center min-h-full px-6 py-12">
      {/* Hero */}
      <div className="w-full max-w-2xl space-y-1 mb-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Outbound AI</h1>
        </div>
        {totalCalls > 0 && (
          <p className="text-sm text-muted-foreground">
            {totalCalls} {totalCalls === 1 ? 'call' : 'calls'} made
          </p>
        )}
      </div>

      {/* Chat input */}
      <div className="w-full max-w-2xl">
        <AnimatedAIChat
          onSubmit={handleSubmit}
          loading={loading}
          locationHint={locationHint}
          onLocationDetected={handleLocationDetected}
          showHeading={false}
          animatedPlaceholderTexts={GOOEY_PROMPTS}
        />
      </div>

      {/* Recent calls */}
      {recentTasks.length > 0 && (
        <div className="w-full max-w-2xl mt-10 space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 px-1">
            Recent calls
          </p>
          <div className="space-y-1">
            {recentTasks.map((task) => {
              const cfg = statusConfig[task.status] ?? statusConfig.failed
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotClass}`} />
                  <span className="flex-1 text-sm text-foreground/80 truncate group-hover:text-foreground transition-colors">
                    {task.description}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 rounded-md px-1.5 py-0.5 border ${cfg.badgeClass}`}
                  >
                    {cfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground/50 shrink-0 w-12 text-right">
                    {timeAgo(task.created_at)}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
