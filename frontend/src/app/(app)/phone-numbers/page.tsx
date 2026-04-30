export default function PhoneNumbersPage() {
  const numbers = [
    { id: '1', number: '+1 (415) 555-0182', label: 'Main Line', status: 'Active', agent: 'Agents' },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Phone Numbers</h1>
        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Coming soon</span>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Number</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Label</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Assigned Agent</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map((n) => (
              <tr key={n.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium font-mono">{n.number}</td>
                <td className="px-4 py-3 text-muted-foreground">{n.label}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">{n.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{n.agent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
