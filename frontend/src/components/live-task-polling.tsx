'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Transcript = { id: number; role: string; content: string }

export function LiveTaskPolling({
  taskId,
  initialTranscripts,
}: {
  taskId: string
  initialTranscripts: Transcript[]
}) {
  const [transcripts, setTranscripts] = useState<Transcript[]>(initialTranscripts)
  const [isLive, setIsLive] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!isLive) return

    const interval = setInterval(async () => {
      const { data: task } = await supabase.from('tasks').select('status').eq('id', taskId).single()
      if (!task || task.status !== 'calling') {
        setIsLive(false)
        clearInterval(interval)
        // Reload to get final state from server
        window.location.reload()
        return
      }
      const { data } = await supabase
        .from('transcripts').select('*').eq('task_id', taskId).order('ts', { ascending: true })
      if (data) setTranscripts(data)
    }, 3000)

    return () => clearInterval(interval)
  }, [isLive, taskId])

  const newTranscripts = transcripts.slice(initialTranscripts.length)
  if (!newTranscripts.length) return null

  return (
    <div className="space-y-3">
      {newTranscripts.map((t) => (
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
      <div className="flex justify-start">
        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5">
          <span className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
          </span>
        </div>
      </div>
    </div>
  )
}
