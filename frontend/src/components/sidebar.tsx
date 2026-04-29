'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, Settings, Zap, Layers, BookOpen, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusConfig } from '@/lib/status'
import { SignOutButton } from '@/components/sign-out-button'

type Task = {
  id: string
  description: string
  status: string
}

type SidebarProps = {
  tasks: Task[]
  user: { name: string; email: string; initials: string }
}

export function Sidebar({ tasks, user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-full border-r border-sidebar-border"
      style={{ background: 'var(--sidebar)' }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-3">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            Outbound AI
          </span>
        </Link>
      </div>

      {/* New Call button */}
      <div className="px-3 pb-1">
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium',
            'bg-primary text-primary-foreground',
            'hover:opacity-90 transition-opacity'
          )}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          New Call
        </Link>
      </div>

      {/* Secondary nav */}
      <div className="px-3 pb-3">
        <Link
          href="/batch"
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors',
            pathname === '/batch'
              ? 'bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary pl-[10px]'
              : 'text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground'
          )}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          Batch Calls
        </Link>
      </div>

      {/* Recents */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {tasks.length > 0 && (
          <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Recents
          </p>
        )}
        <nav className="space-y-0.5">
          {tasks.map((task) => {
            const isActive = pathname === `/tasks/${task.id}`
            const dot = statusConfig[task.status] ?? statusConfig.failed

            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors group',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary pl-[6px]'
                    : 'text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground'
                )}
              >
                {/* Status dot */}
                <span
                  className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot.dotClass)}
                />
                <span className="truncate text-xs leading-relaxed">
                  {task.description}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Resources / tutorial section */}
      <div className="px-2 pb-2 pt-1 border-t border-sidebar-border/40">
        <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
          Resources
        </p>
        <button
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg w-full text-left text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs">How it works</span>
        </button>
        <button
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg w-full text-left text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs">FAQ</span>
        </button>
      </div>

      {/* Bottom user section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
            {user.initials}
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
              {user.name.split(' ')[0]}
            </p>
            <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
              {user.email}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/profile"
              className={cn(
                'p-1.5 rounded-md transition-colors',
                pathname === '/profile'
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground/60 hover:text-sidebar-foreground hover:bg-white/5'
              )}
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
            <SignOutButton iconOnly />
          </div>
        </div>
      </div>
    </aside>
  )
}
