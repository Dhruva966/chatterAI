export default function KnowledgeBasePage() {
  const entries = [
    { id: '1', name: 'Restaurant Reservation Script', type: 'Document', updated: '2 days ago' },
    { id: '2', name: 'Healthcare Appointment FAQ', type: 'FAQ', updated: '5 days ago' },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Knowledge Base</h1>
        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Coming soon</span>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{entry.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{entry.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{entry.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
