'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bot, Search, MoreHorizontal, Pencil, Trash2, Plus, Loader2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type Agent = {
  id: string
  name: string
  agent_type: string
  voice: string
  system_prompt: string | null
  created_at: string
  updated_at: string
}

const AGENT_TYPES: Record<string, string> = {
  generic:                   'General',
  food_ordering:             'Food Ordering',
  appointment_booking:       'Appointment Booking',
  general_customer_service:  'Customer Service',
  insurance_calls:           'Insurance',
  negotiator:                'Negotiator',
  car_dealership:            'Car Dealership',
  custom:                    'Custom',
}

const VOICES: Record<string, string> = {
  'aura-asteria-en':  'Asteria (F)',
  'aura-luna-en':     'Luna (F)',
  'aura-stella-en':   'Stella (F)',
  'aura-athena-en':   'Athena (F)',
  'aura-hera-en':     'Hera (F)',
  'aura-orion-en':    'Orion (M)',
  'aura-arcas-en':    'Arcas (M)',
  'aura-perseus-en':  'Perseus (M)',
  'aura-helios-en':   'Helios (M)',
  'aura-zeus-en':     'Zeus (M)',
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

type ModalMode = 'create' | 'edit'

type FormState = {
  name: string
  agent_type: string
  voice: string
  system_prompt: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  agent_type: 'generic',
  voice: 'aura-asteria-en',
  system_prompt: '',
}

export default function AgentsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modal, setModal] = useState<{ open: boolean; mode: ModalMode; agent?: Agent }>({
    open: false, mode: 'create',
  })
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)

  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return null }
    return session.access_token
  }

  async function loadAgents() {
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      setAgents(await res.json())
    } catch (err) {
      console.error(err)
      toast.error('Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAgents() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function openCreate() {
    setForm(DEFAULT_FORM)
    setModal({ open: true, mode: 'create' })
  }

  function openEdit(agent: Agent) {
    setForm({
      name: agent.name,
      agent_type: agent.agent_type,
      voice: agent.voice,
      system_prompt: agent.system_prompt ?? '',
    })
    setModal({ open: true, mode: 'edit', agent })
    setMenuOpen(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Agent name required'); return }
    setSaving(true)
    const token = await getToken()
    if (!token) { setSaving(false); return }
    try {
      const url = modal.mode === 'create'
        ? `${process.env.NEXT_PUBLIC_API_URL}/agents`
        : `${process.env.NEXT_PUBLIC_API_URL}/agents/${modal.agent!.id}`
      const res = await fetch(url, {
        method: modal.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved: Agent = await res.json()
      setAgents(prev =>
        modal.mode === 'create'
          ? [saved, ...prev]
          : prev.map(a => a.id === saved.id ? saved : a)
      )
      setModal({ open: false, mode: 'create' })
      toast.success(modal.mode === 'create' ? 'Agent created' : 'Agent updated')
    } catch (err) {
      console.error(err)
      toast.error('Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(agent: Agent) {
    setMenuOpen(null)
    const token = await getToken()
    if (!token) return
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      setAgents(prev => prev.filter(a => a.id !== agent.id))
      toast.success('Agent deleted')
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete agent')
    }
  }

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Agents</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Create an Agent
        </button>
      </div>

      {/* Search */}
      <div className="px-8 py-4 border-b border-border">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
            <div className="w-14 h-14 rounded-xl border border-border flex items-center justify-center bg-muted/20">
              <Bot className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              {search ? 'No agents match your search' : "You don't have any agents yet"}
            </p>
            {!search && (
              <button
                onClick={openCreate}
                className="text-sm text-primary hover:underline"
              >
                Create your first agent
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-8 py-3 text-left text-xs font-medium text-muted-foreground/60 uppercase tracking-wider w-[30%]">Agent Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/60 uppercase tracking-wider w-[20%]">Agent Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/60 uppercase tracking-wider w-[20%]">Voice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/60 uppercase tracking-wider w-[15%]">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground/60 uppercase tracking-wider w-[15%]">Last Edited</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(agent => (
                <tr
                  key={agent.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-8 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground truncate">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {AGENT_TYPES[agent.agent_type] ?? agent.agent_type}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {VOICES[agent.voice] ?? agent.voice}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">—</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs">
                    {relativeDate(agent.updated_at || agent.created_at)}
                  </td>
                  <td className="px-4 py-3.5 relative">
                    <div ref={menuOpen === agent.id ? menuRef : null}>
                      <button
                        onClick={() => setMenuOpen(menuOpen === agent.id ? null : agent.id)}
                        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuOpen === agent.id && (
                        <div className="absolute right-4 top-10 z-50 w-36 rounded-lg border border-border bg-card shadow-lg py-1">
                          <button
                            onClick={() => openEdit(agent)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(agent)}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal({ open: false, mode: 'create' })} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">
                {modal.mode === 'create' ? 'Create Agent' : 'Edit Agent'}
              </h2>
              <button
                onClick={() => setModal({ open: false, mode: 'create' })}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="text-sm font-medium block mb-1.5">Agent Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sales Outreach Bot"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
                />
              </div>

              {/* Agent Type */}
              <div>
                <label className="text-sm font-medium block mb-1.5">Agent Type</label>
                <select
                  value={form.agent_type}
                  onChange={e => setForm(f => ({ ...f, agent_type: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {Object.entries(AGENT_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Voice */}
              <div>
                <label className="text-sm font-medium block mb-1.5">Voice</label>
                <select
                  value={form.voice}
                  onChange={e => setForm(f => ({ ...f, voice: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {Object.entries(VOICES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-sm font-medium block mb-1.5">System Prompt</label>
                <textarea
                  value={form.system_prompt}
                  onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                  placeholder="You are an AI phone agent for Acme Corp. Your goal is to..."
                  rows={6}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40 resize-none font-mono"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={() => setModal({ open: false, mode: 'create' })}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  'px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-foreground text-background transition-opacity',
                  saving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                )}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {modal.mode === 'create' ? 'Create Agent' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
