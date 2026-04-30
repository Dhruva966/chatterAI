export default function AnalyticsPage() {
  const stats = [
    { label: 'Total Calls', value: '—' },
    { label: 'Success Rate', value: '—' },
    { label: 'Avg Duration', value: '—' },
    { label: 'Calls This Week', value: '—' },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">Coming soon</span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg p-5">
            <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
