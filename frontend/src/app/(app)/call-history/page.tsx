import { createClient } from '@/lib/supabase/server'
import { History } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-red-500/10 text-red-500',
  calling: 'bg-blue-500/10 text-blue-500',
  pending: 'bg-yellow-500/10 text-yellow-600',
  cancelled: 'bg-muted text-muted-foreground',
}

export default async function CallHistoryPage() {
  const supabase = await createClient()
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, description, business_name, status, created_at')
    .order('created_at', { ascending: false })

  const calls = tasks ?? []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Call History</h1>
        <span className="text-sm text-muted-foreground">{calls.length} calls</span>
      </div>

      {calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <History className="w-10 h-10 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm">No calls yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Business</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 max-w-xs truncate font-medium">{call.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{call.business_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[call.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(call.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
