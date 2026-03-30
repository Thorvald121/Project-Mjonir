'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import GlobalSearch from '@/components/GlobalSearch'
import { useKeyboardShortcuts, ShortcutsModal } from '@/components/KeyboardShortcuts'
import {
  LayoutDashboard, Ticket, Users, Clock, FileText,
  Package, BarChart2, BookOpen, Settings, LogOut,
  TrendingUp, ClipboardList, ChevronLeft, ChevronRight, ChevronDown,
  Zap, UsersRound, Moon, Sun, Menu, X, Activity,
  FileCode2, FileBarChart, FileSignature, Shield, Star, Keyboard, Repeat,
  Upload,
} from 'lucide-react'

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Service',
    items: [
      { label: 'Dashboard',     icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Tickets',       icon: Ticket,          href: '/tickets' },
      { label: 'Customers',     icon: Users,           href: '/customers' },
      { label: 'Time Tracking', icon: Clock,           href: '/time-tracking' },
      { label: 'Maintenance',   icon: Repeat,          href: '/maintenance' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices',   icon: FileText,      href: '/invoices' },
      { label: 'Contracts',  icon: FileSignature, href: '/contracts' },
      { label: 'Quotes',     icon: ClipboardList, href: '/quotes' },
      { label: 'Pipeline',   icon: TrendingUp,    href: '/pipeline' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Inventory',   icon: Package,  href: '/inventory' },
      { label: 'Monitoring',  icon: Activity, href: '/monitoring' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Reports',           icon: BarChart2,  href: '/reports' },
      { label: 'Scheduled Reports', icon: FileBarChart, href: '/scheduled-reports' },
      { label: 'CSAT',              icon: Star,       href: '/csat-analytics' },
      { label: 'Tech Dashboard',    icon: UsersRound, href: '/tech-dashboard' },
    ],
  },
]

const ADMIN_ITEMS = [
  { label: 'Knowledge Base',     icon: BookOpen,  href: '/knowledge-base' },
  { label: 'Canned Replies',     icon: BookOpen,  href: '/canned-replies' },
  { label: 'Ticket Templates',   icon: FileCode2, href: '/ticket-templates' },
  { label: 'MSP Plans',          icon: Package,   href: '/msp-plans' },
  { label: 'Email Automations',  icon: Zap,       href: '/email-automations' },
  { label: 'Ticket Automations', icon: Zap,       href: '/ticket-automations' },
  { label: 'Audit Log',          icon: Shield,    href: '/audit-log' },
  { label: 'Import',             icon: Upload,    href: '/import' },
  { label: 'Settings',           icon: Settings,  href: '/settings' },
]

const REALTIME_TABLES = [
  'tickets', 'ticket_comments', 'customers', 'customer_contacts',
  'invoices', 'quotes', 'time_entries', 'knowledge_articles', 'organization_members',
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createSupabaseBrowserClient()

  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark,       setDark]       = useState(false)
  const [userEmail,  setUserEmail]  = useState<string | null>(null)
  const { showModal: showShortcuts, setShowModal: setShowShortcuts } = useKeyboardShortcuts()

  // Track which groups are open — all open by default, persisted to localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [mounted,    setMounted]    = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('nav-groups')
      if (saved) setOpenGroups(JSON.parse(saved))
    } catch {}
  }, [])

  const isGroupOpen = (label: string) => !mounted ? true : openGroups[label] !== false // default open

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [label]: !isGroupOpen(label) }
      localStorage.setItem('nav-groups', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    const saved  = localStorage.getItem('theme')
    const isDark = saved === 'dark'
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  useEffect(() => {
    const channel = supabase.channel('global-admin-realtime')
    REALTIME_TABLES.forEach(table => {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, (payload: any) => {
        window.dispatchEvent(new CustomEvent('supabase:change', { detail: { table, event: payload.eventType } }))
      })
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const NavLink = ({ item }: { item: { label: string; icon: any; href: string } }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    )
  }

  const Sidebar = () => (
    <div className={`flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 ${
      collapsed ? 'w-16' : 'w-56'
    }`}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        {!collapsed && (
          <span className="font-bold text-slate-900 dark:text-white text-sm">Valhalla RMM</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hidden lg:block"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto space-y-1">
        {NAV_GROUPS.map(group => {
          const open    = isGroupOpen(group.label)
          const anyActive = group.items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
          return (
            <div key={group.label}>
              {/* Group header — hidden when collapsed */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    anyActive
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
              )}
              {/* Items */}
              {(open || collapsed) && (
                <div className={`space-y-0.5 ${!collapsed ? 'ml-0' : ''}`}>
                  {group.items.map(item => <NavLink key={item.href} item={item} />)}
                </div>
              )}
            </div>
          )
        })}

        {/* Admin section */}
        <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
          {!collapsed && (
            <button
              onClick={() => toggleGroup('__admin__')}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <span>Admin</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isGroupOpen('__admin__') ? '' : '-rotate-90'}`} />
            </button>
          )}
          {(isGroupOpen('__admin__') || collapsed) && (
            <div className="space-y-0.5">
              {ADMIN_ITEMS.map(item => <NavLink key={item.href} item={item} />)}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
        <button
          onClick={toggleDark}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        {!collapsed && userEmail && (
          <div className="px-3 py-2">
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
        {!collapsed && (
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Keyboard className="w-4 h-4" />
            <span>Shortcuts</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 flex flex-col w-56">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <GlobalSearch />
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}