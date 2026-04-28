import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Phone } from 'lucide-react'
import { LiveTaskPolling } from '@/components/live-task-polling'

const statusConfig: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Scheduled', className: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  calling:   { label: 'Live',      className: 'bg-amber-950 text-amber-300 border-amber-800' },
  completed: { label: 'Done',      className: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  failed:    { label: 'Failed',    className: 'bg-red-950 text-red-300 border-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-900 text-zinc-500 border-zinc-800' },
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: task } = await supabase.from('tasks').select('*').eq('id', id).single()
  if (!task || task.user_id !== user.id) notFound()

  const { data: transcripts } = await supabase
    .from('transcripts').select('*').eq('task_id', id).order('ts', { ascending: true })

  const status = statusConfig[task.status] ?? statusConfig.failed
  const isLive = task.status === 'calling'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.description}</p>
          </div>
          <Badge variant="outline" className={`text-xs shrink-0 rounded-lg px-2 py-0.5 ${status.className}`}>
            {isLive && <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            {status.label}
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="w-3 h-3" />
          <span>{task.business_name || task.phone_number}</span>
          <span className="text-border">·</span>
          <span>{new Date(task.created_at).toLocaleString()}</span>
        </div>

        {/* Transcript */}
        <div className="space-y-3">
          {(transcripts || []).map((t: { id: number; role: string; content: string }) => (
            <div key={t.id} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                t.role === 'assistant'
                  ? 'bg-muted text-foreground rounded-tl-sm'
                  : 'bg-primary text-primary-foreground rounded-tr-sm'
              }`}>
                {t.content}
              </div>
            </div>
          ))}

          {!transcripts?.length && !isLive && (
            <p className="text-sm text-muted-foreground text-center py-8">No transcript yet.</p>
          )}
        </div>

        {/* Live polling — client component takes over for live calls */}
        {isLive && <LiveTaskPolling taskId={id} initialTranscripts={transcripts || []} />}

        {/* Result */}
        {task.result && (
          <Card className="border-border/50 rounded-2xl">
            <CardContent className="px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Result</p>
              <p className="text-sm leading-relaxed">{task.result}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
