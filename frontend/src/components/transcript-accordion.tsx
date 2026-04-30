'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { LiveTaskPolling } from '@/components/live-task-polling'

type Transcript = {
  id: number
  role: string
  content: string
}

type TranscriptAccordionProps = {
  transcripts: Transcript[]
  isLive: boolean
  taskId: string
}

export function TranscriptAccordion({ transcripts, isLive, taskId }: TranscriptAccordionProps) {
  const [isOpen, setIsOpen] = useState(isLive)

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        {isOpen ? 'Hide transcript' : 'View transcript'}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="transcript"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-3 pt-2 pb-1">
              {transcripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      t.role === 'assistant'
                        ? 'bg-muted text-foreground rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm'
                    }`}
                  >
                    {t.content}
                  </div>
                </div>
              ))}

              {!transcripts.length && !isLive && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transcript yet.
                </p>
              )}

              {isLive && (
                <LiveTaskPolling taskId={taskId} initialTranscripts={transcripts} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
