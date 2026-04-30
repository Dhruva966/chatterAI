import { MessageSquare } from 'lucide-react'

export default function ChatHistoryPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Chat History</h1>
        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Coming soon</span>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-sm">No chat history yet</p>
      </div>
    </div>
  )
}
