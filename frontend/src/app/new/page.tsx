'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Phone, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const EXAMPLES = [
  'Call Chipotle on Market St and order a burrito bowl with chicken, black beans, and guac for pickup in 30 min',
  'Book me a haircut at the nearest Great Clips for tomorrow afternoon',
  'Call Comcast support and ask about cancelling my subscription — I want to negotiate a better rate',
]

export default function NewTaskPage() {
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!request.trim()) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ request: request.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start call')
      }

      const task = await res.json()
      toast.success('Call started!')
      router.push(`/tasks/${task.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-medium">New Call</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">What should the AI do?</h1>
            <p className="text-sm text-muted-foreground">
              Describe the call in plain English. Include the business name, what you need, and any relevant details.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={EXAMPLES[0]}
              className="min-h-36 rounded-2xl resize-none text-sm leading-relaxed border-border/50 focus-visible:ring-primary/30"
              disabled={loading}
            />

            <Button
              type="submit"
              disabled={loading || !request.trim()}
              className="w-full h-11 rounded-xl gap-2 font-medium"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting call…</>
              ) : (
                <><Phone className="w-4 h-4" /> Start Call</>
              )}
            </Button>
          </form>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Examples</p>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setRequest(ex)}
                  className="w-full text-left text-sm text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-xl px-4 py-3 transition-all duration-150 leading-relaxed"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
