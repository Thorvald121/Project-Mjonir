// @ts-nocheck
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Keyboard, X, Command } from 'lucide-react'

// ── Shortcut definitions ────────────────────────────────────────────────────
// Sequences like 'g c' mean: press G then C within 1 second
// Singles like 'n' mean: just press N (when not in an input)
const SHORTCUTS = [
  // Navigation — G prefix sequences
  { keys: 'g d', label: 'Go to Dashboard',     action: 'nav', target: '/dashboard',        group: 'Navigate' },
  { keys: 'g t', label: 'Go to Tickets',        action: 'nav', target: '/tickets',           group: 'Navigate' },
  { keys: 'g c', label: 'Go to Customers',      action: 'nav', target: '/customers',         group: 'Navigate' },
  { keys: 'g i', label: 'Go to Invoices',       action: 'nav', target: '/invoices',          group: 'Navigate' },
  { keys: 'g q', label: 'Go to Quotes',         action: 'nav', target: '/quotes',            group: 'Navigate' },
  { keys: 'g r', label: 'Go to Reports',        action: 'nav', target: '/reports',           group: 'Navigate' },
  { keys: 'g k', label: 'Go to Knowledge Base', action: 'nav', target: '/knowledge-base',    group: 'Navigate' },
  { keys: 'g p', label: 'Go to Pipeline',       action: 'nav', target: '/pipeline',          group: 'Navigate' },
  { keys: 'g m', label: 'Go to Monitoring',     action: 'nav', target: '/monitoring',        group: 'Navigate' },
  { keys: 'g s', label: 'Go to Settings',       action: 'nav', target: '/settings',          group: 'Navigate' },
  // Actions
  { keys: 'n',   label: 'New Ticket',           action: 'event', target: 'new-ticket',       group: 'Actions'  },
  { keys: 'c',   label: 'New Customer',         action: 'event', target: 'new-customer',     group: 'Actions'  },
  { keys: '/',   label: 'Search',               action: 'event', target: 'open-search',      group: 'Actions'  },
  { keys: '?',   label: 'Show shortcuts',       action: 'modal', target: 'shortcuts',        group: 'Actions'  },
  { keys: 'Escape', label: 'Close / Cancel',    action: 'event', target: 'escape',           group: 'Actions', hidden: true },
]

const SEQUENCE_TIMEOUT = 1000 // ms to wait for second key in a sequence

// ── Hook ────────────────────────────────────────────────────────────────────
export function useKeyboardShortcuts() {
  const router      = useRouter()
  const [showModal, setShowModal] = useState(false)
  const lastKey     = useRef<{ key: string; time: number } | null>(null)

  const isInputFocused = useCallback(() => {
    const el = document.activeElement
    if (!el) return false
    const tag = el.tagName.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      (el as HTMLElement).contentEditable === 'true' ||
      (el as HTMLElement).closest('[role="dialog"]') !== null
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Never fire if user is typing in a field
      // Exception: '?' and Escape always work
      const key = e.key.toLowerCase()
      if (key === '?' && !isInputFocused()) {
        e.preventDefault()
        setShowModal(s => !s)
        return
      }
      if (key === 'escape') {
        setShowModal(false)
        window.dispatchEvent(new CustomEvent('valhalla:shortcut', { detail: { action: 'event', target: 'escape' } }))
        return
      }

      // Block all other shortcuts when typing
      if (isInputFocused()) return

      // Cmd+K / Ctrl+K handled by GlobalSearch
      if ((e.metaKey || e.ctrlKey) && key === 'k') return

      const now = Date.now()
      const prev = lastKey.current

      // Check for two-key sequence (e.g. g → d)
      if (prev && now - prev.time < SEQUENCE_TIMEOUT) {
        const seq = `${prev.key} ${key}`
        const match = SHORTCUTS.find(s => s.keys === seq)
        if (match) {
          e.preventDefault()
          lastKey.current = null
          fire(match, router, setShowModal)
          return
        }
      }

      // Check for single-key shortcut
      const single = SHORTCUTS.find(s => s.keys === key && !s.keys.includes(' '))
      if (single) {
        // 'g' is a prefix — record it and wait for next key
        if (key === 'g') {
          e.preventDefault()
          lastKey.current = { key: 'g', time: now }
          return
        }
        e.preventDefault()
        lastKey.current = null
        fire(single, router, setShowModal)
        return
      }

      // Record key as potential prefix
      lastKey.current = { key, time: now }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router, isInputFocused])

  return { showModal, setShowModal }
}

function fire(shortcut: any, router: any, setShowModal: any) {
  if (shortcut.action === 'nav') {
    router.push(shortcut.target)
  } else if (shortcut.action === 'event') {
    window.dispatchEvent(new CustomEvent('valhalla:shortcut', {
      detail: { action: 'event', target: shortcut.target }
    }))
  } else if (shortcut.action === 'modal' && shortcut.target === 'shortcuts') {
    setShowModal((s: boolean) => !s)
  }
}

// ── Modal ────────────────────────────────────────────────────────────────────
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const groups: Record<string, typeof SHORTCUTS> = {}
  SHORTCUTS.filter(s => !s.hidden).forEach(s => {
    if (!groups[s.group]) groups[s.group] = []
    groups[s.group].push(s)
  })

  const formatKeys = (keys: string) =>
    keys.split(' ').map((k, i) => (
      <span key={i} className="inline-flex items-center gap-1">
        {i > 0 && <span className="text-slate-400 text-xs mx-0.5">then</span>}
        <kbd className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[11px] font-mono text-slate-700 dark:text-slate-200 shadow-sm">
          {k === '/' ? '/' : k === '?' ? '?' : k.toUpperCase()}
        </kbd>
      </span>
    ))

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-amber-500" />
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcut list */}
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{group}</p>
              <div className="space-y-1">
                {items.map(s => (
                  <div key={s.keys} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {formatKeys(s.keys)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Search shortcut note */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Also available</p>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-700 dark:text-slate-300">Open Search</span>
              <div className="flex items-center gap-1">
                <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[11px] font-mono text-slate-700 dark:text-slate-200">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
          <p className="text-xs text-slate-400 text-center">Shortcuts are disabled when typing in a field. Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-mono">?</kbd> anytime to show this.</p>
        </div>
      </div>
    </div>
  )
}