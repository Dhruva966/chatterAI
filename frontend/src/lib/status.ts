export const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  pending:   { label: 'Scheduled', dotClass: 'border border-zinc-500 bg-transparent',  badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  calling:   { label: 'Live',      dotClass: 'bg-amber-500 animate-pulse',              badgeClass: 'bg-amber-950 text-amber-300 border-amber-800' },
  completed: { label: 'Done',      dotClass: 'bg-emerald-500',                          badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  failed:    { label: 'Failed',    dotClass: 'bg-red-500',                              badgeClass: 'bg-red-950 text-red-300 border-red-800' },
  cancelled: { label: 'Cancelled', dotClass: 'bg-zinc-600',                             badgeClass: 'bg-zinc-900 text-zinc-500 border-zinc-800' },
}
