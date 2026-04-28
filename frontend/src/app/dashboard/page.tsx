import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Plus, Phone, LogOut } from 'lucide-react'
import { SignOutButton } from '@/components/sign-out-button'

type Task = {
  id: string
  description: string
  business_name: string | null
  phone_number: string
  status: string
  agent_type: string
  result: string | null
  created_at: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Scheduled', className: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  calling:   { label: 'Live',      className: 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse' },
  completed: { label: 'Done',      className: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  failed:    { label: 'Failed',    className: 'bg-red-950 text-red-300 border-red-800' },
  cancelled: { label: 'Cancelled', className: 'bg-zinc-900 text-zinc-500 border-zinc-800' },
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })

  const initials = user.user_metadata?.full_name
    ?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold tracking-tight">Outbound AI</span>
          <div className="flex items-center gap-3">
            <Link href="/new">
              <Button size="sm" className="gap-2 rounded-xl h-8">
                <Plus className="w-3.5 h-3.5" />
                New Call
              </Button>
            </Link>
            <Link href="/profile">
              <Avatar className="w-8 h-8 cursor-pointer ring-2 ring-border hover:ring-primary transition-all">
                <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        {!tasks || tasks.length === 0 ? (
          <EmptyState />
        ) : (
          tasks.map((task: Task) => <TaskCard key={task.id} task={task} />)
        )}
      </main>
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const status = statusConfig[task.status] ?? statusConfig.failed

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card className="border-border/50 hover:border-border hover:bg-card/80 transition-all duration-200 cursor-pointer rounded-2xl">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">
              {task.description}
            </p>
            <Badge variant="outline" className={`text-xs shrink-0 rounded-lg px-2 py-0.5 ${status.className}`}>
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{task.business_name || task.phone_number}</span>
            <span className="text-border">·</span>
            <span>{new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          {task.result && (
            <p className="mt-2 text-xs text-muted-foreground line-clamp-1">{task.result}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <Phone className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">No calls yet</p>
        <p className="text-sm text-muted-foreground">Start your first AI phone call.</p>
      </div>
      <Link href="/new">
        <Button className="rounded-xl gap-2">
          <Plus className="w-4 h-4" />
          New Call
        </Button>
      </Link>
    </div>
  )
}
