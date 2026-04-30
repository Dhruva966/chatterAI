'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Phone, Sparkles, Hash, LayoutGrid, History,
  BarChart3, ShieldCheck, Bell, Settings, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/sign-out-button'

type SidebarProps = {
  tasks: { id: string; description: string; status: string }[]
  user: { name: string; email: string; initials: string }
}

const navSections = [
  {
    label: 'Build',
    items: [
      { label: 'My Calls',      href: '/dashboard', icon: Phone,       mock: false },
      { label: 'Templates',     href: '#',           icon: Sparkles,    mock: true  },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { label: 'Phone Numbers', href: '#',    icon: Hash,        mock: true  },
      { label: 'Batch Calls',   href: '/batch', icon: LayoutGrid, mock: false },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { label: 'Call History',  href: '/dashboard', icon: History,     mock: false },
      { label: 'Analytics',     href: '#',           icon: BarChart3,   mock: true  },
      { label: 'AI Quality',    href: '#',           icon: ShieldCheck, mock: true  },
      { label: 'Alerting',      href: '#',           icon: Bell,        mock: true  },
    ],
  },
]

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-full border-r border-sidebar-border"
      style={{ background: 'var(--sidebar)' }}
    >
      {/* Logo / workspace header */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border/40">
        <Link href="/dashboard" className="flex items-center gap-2 group mb-0.5">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            Outbound AI
          </span>
        </Link>
        <p className="text-[10px] text-muted-foreground/50 pl-6 truncate">
          {user.email}
        </p>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              {section.label}
            </p>
            <div className="space-y-0.5 mt-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = !item.mock && pathname === item.href
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : item.mock
                        ? 'text-muted-foreground/40 hover:text-muted-foreground/60 hover:bg-white/5 cursor-default'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate leading-tight">
              {user.name.split(' ')[0]}
            </p>
            <p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
              {user.email}
            </p>
          </div>
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
