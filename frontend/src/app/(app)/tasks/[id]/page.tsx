import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, ArrowLeft } from 'lucide-react'
import { TranscriptAccordion } from '@/components/transcript-accordion'
import { PostCallFeedback } from '@/components/post-call-feedback'
import { statusConfig } from '@/lib/status'

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: task } = await supabase.from('tasks').select('*').eq('id', id).single()
  if (!task || task.user_id !== user.id) notFound()

  const { data: transcripts } = await supabase
    .from('transcripts')
    .select('*')
    .eq('task_id', id)
    .order('ts', { ascending: true })

  const cfg = statusConfig[task.status] ?? statusConfig.failed
  const isLive = task.status === 'calling'

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard"
          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="All calls"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-snug">{task.description}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{task.business_name || task.phone_number}</span>
            <span className="text-border">·</span>
            <span>{new Date(task.created_at).toLocaleString()}</span>
          </div>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 rounded-lg px-2 py-0.5 border ${cfg.badgeClass}`}>
          {isLive && (
            <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
          {cfg.label}
        </Badge>
      </div>

      {/* Result / Status summary card */}
      <Card className="border-border/40 rounded-2xl">
        <CardContent className="px-6 py-5">
          {task.result ? (
            <>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-2">
                Summary
              </p>
              <p className="text-sm leading-relaxed">{task.result}</p>
            </>
          ) : isLive ? (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Call in progress…
            </div>
          ) : task.status === 'pending' ? (
            <p className="text-sm text-muted-foreground">Scheduled — call will begin shortly.</p>
          ) : task.status === 'failed' ? (
            <p className="text-sm text-red-400">Call failed. No result available.</p>
          ) : (
            <p className="text-sm text-muted-foreground">No summary yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Transcript accordion */}
      <TranscriptAccordion
        transcripts={transcripts || []}
        isLive={isLive}
        taskId={id}
      />

      {/* Feedback */}
      <PostCallFeedback taskId={id} initialStatus={task.status} />
    </div>
  )
}
