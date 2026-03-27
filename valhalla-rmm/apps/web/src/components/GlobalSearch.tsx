// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Search, Ticket, Users, FileText, BookOpen,
  DollarSign, X, Clock, ArrowRight, Loader2,
  FileSignature, Package,
} from 'lucide-react'

const CATEGORY_ICONS = {
  ticket:   { icon: Ticket,        color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30'    },
  customer: { icon: Users,         color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30'  },
  invoice:  { icon: DollarSign,    color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  quote:    { icon: FileText,      color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
  kb:       { icon: BookOpen,      color: 'text-sky-500',     bg: 'bg-sky-50 dark:bg-sky-950/30'      },
  contract: { icon: FileSignature, color: 'text-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-950/30'},
  asset:    { icon: Package,       color: 'text-slate-500',   bg: 'bg-slate-100 dark:bg-slate-800'    },
}

const HREFS = {
  ticket:   (r) => `/tickets/${r.id}`,
  customer: (r) => `/customers/${r.id}`,
  invoice:  (r) => `/invoices`,
  quote:    (r) => `/quotes`,
  kb:       (r) => `/knowledge-base`,
  contract: (r) => `/contracts`,
  asset:    (r) => `/inventory`,
}

function highlight(text: string, query: string) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-800 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function GlobalSearch() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const debounce  = useRef<any>(null)

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Search
  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim() || query.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      const q = query.trim()
      const like = `%${q}%`

      const [tickets, customers, invoices, quotes, kb, contracts, assets] = await Promise.all([
        supabase.from('tickets').select('id,title,status,priority,customer_name')
          .or(`title.ilike.${like},customer_name.ilike.${like},contact_email.ilike.${like}`)
          .not('status','in','("closed","resolved")').limit(5),
        supabase.from('customers').select('id,name,contact_name,contact_email,industry')
          .or(`name.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like}`)
          .limit(5),
        supabase.from('invoices').select('id,invoice_number,customer_name,total,status')
          .or(`invoice_number.ilike.${like},customer_name.ilike.${like}`)
          .limit(4),
        supabase.from('quotes').select('id,quote_number,title,customer_name,status')
          .or(`title.ilike.${like},quote_number.ilike.${like},customer_name.ilike.${like}`)
          .limit(3),
        supabase.from('knowledge_articles').select('id,title,category')
          .or(`title.ilike.${like},content.ilike.${like}`)
          .eq('is_published', true).limit(3),
        supabase.from('contracts').select('id,title,customer_name,status')
          .or(`title.ilike.${like},customer_name.ilike.${like}`)
          .limit(3),
        supabase.from('inventory_items').select('id,name,serial_number,model,customer_name')
          .or(`name.ilike.${like},serial_number.ilike.${like},model.ilike.${like}`)
          .limit(3),
      ])

      const all = [
        ...(tickets.data  ?? []).map(r => ({ ...r, _type: 'ticket',   _label: r.title,          _sub: `${r.customer_name || ''} · ${r.status}` })),
        ...(customers.data?? []).map(r => ({ ...r, _type: 'customer', _label: r.name,            _sub: r.contact_email || r.industry || '' })),
        ...(invoices.data ?? []).map(r => ({ ...r, _type: 'invoice',  _label: r.invoice_number,  _sub: `${r.customer_name} · $${(r.total||0).toFixed(2)} · ${r.status}` })),
        ...(quotes.data   ?? []).map(r => ({ ...r, _type: 'quote',    _label: r.title || r.quote_number, _sub: `${r.customer_name || ''} · ${r.status}` })),
        ...(kb.data       ?? []).map(r => ({ ...r, _type: 'kb',       _label: r.title,           _sub: r.category?.replace(/_/g,' ') || '' })),
        ...(contracts.data?? []).map(r => ({ ...r, _type: 'contract', _label: r.title,           _sub: r.customer_name || '' })),
        ...(assets.data   ?? []).map(r => ({ ...r, _type: 'asset',    _label: r.name,            _sub: [r.model, r.serial_number, r.customer_name].filter(Boolean).join(' · ') })),
      ]

      setResults(all)
      setSelected(0)
      setLoading(false)
    }, 200)
  }, [query])

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && results[selected]) { navigate(results[selected]) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected])

  const navigate = useCallback((result: any) => {
    const href = HREFS[result._type]?.(result)
    if (href) { router.push(href); setOpen(false) }
  }, [router])

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-400 transition-colors w-48"
    >
      <Search className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] text-slate-400 font-mono">
        ⌘K
      </kbd>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          {loading
            ? <Loader2 className="w-4 h-4 text-slate-400 flex-shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tickets, customers, invoices…"
            className="flex-1 text-sm text-slate-900 dark:text-white bg-transparent focus:outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] text-slate-400 font-mono">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto">
          {!query && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Search across tickets, customers, invoices, quotes, KB articles and more</p>
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-400">No results for <strong className="text-slate-600 dark:text-slate-300">"{query}"</strong></p>
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {results.map((r, i) => {
                const cat = CATEGORY_ICONS[r._type]
                const Icon = cat?.icon ?? FileText
                const isSelected = i === selected
                return (
                  <button key={`${r._type}-${r.id}`}
                    onClick={() => navigate(r)}
                    onMouseEnter={() => setSelected(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cat?.bg}`}>
                      <Icon className={`w-4 h-4 ${cat?.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {highlight(r._label || '—', query)}
                      </p>
                      {r._sub && (
                        <p className="text-xs text-slate-400 truncate capitalize">{r._sub}</p>
                      )}
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${isSelected ? 'text-amber-500 opacity-100' : 'opacity-0'}`} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">↵</kbd> open</span>
          <span className="flex items-center gap-1"><kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">Esc</kbd> close</span>
          {results.length > 0 && <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </div>
  )
}