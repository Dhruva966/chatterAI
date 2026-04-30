'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bot, BookOpen, Phone, Layers, History, MessageSquare,
  BarChart2, ShieldCheck, Bell, Settings, Zap, PhoneCall,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/sign-out-button'

type SidebarProps = {
  user: { name: string; email: string; initials: string }
}

type NavItem = { label: string; href: string; icon: React.ElementType }
type NavSection = { title: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    title: 'BUILD',
    items: [
      { label: 'Agents',         href: '/agents',         icon: Bot },
      { label: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
    ],
  },
  {
    title: 'DEPLOY',
    items: [
      { label: 'Phone Numbers', href: '/phone-numbers', icon: Phone },
      { label: 'Batch Call',    href: '/batch',         icon: Layers },
    ],
  },
  {
    title: 'MONITOR',
    items: [
      { label: 'Call History',         href: '/call-history', icon: History },
      { label: 'Chat History',         href: '/chat-history', icon: MessageSquare },
      { label: 'Analytics',            href: '/analytics',    icon: BarChart2 },
      { label: 'AI Quality Assurance', href: '/ai-qa',        icon: ShieldCheck },
      { label: 'Alerting',             href: '/alerting',     icon: Bell },
    ],
  },
]

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-full border-r border-sidebar-border"
      style={{ background: 'var(--sidebar)' }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            Outbound AI
          </span>
        </Link>
      </div>

      {/* New Call CTA */}
      <div className="px-3 pb-3">
        <Link
          href="/dashboard"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <PhoneCall className="w-3.5 h-3.5 shrink-0" />
          New Call
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
        {NAV.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: plan badge + user */}
      <div className="border-t border-sidebar-border p-3 space-y-3">
        <div className="px-2">
          <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
            Free Trial
          </span>
        </div>
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
