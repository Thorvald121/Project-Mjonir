'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  LayoutDashboard, Ticket, Users, Clock, FileText,
  Package, BarChart2, BookOpen, Settings, LogOut,
  TrendingUp, ClipboardList, ChevronLeft, ChevronRight,
  Zap, UsersRound, Moon, Sun, Menu, X
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Tickets',         icon: Ticket,           href: '/tickets' },
  { label: 'Customers',       icon: Users,            href: '/customers' },
  { label: 'Time Tracking',   icon: Clock,            href: '/time-tracking' },
  { label: 'Invoices',        icon: FileText,         href: '/invoices' },
  { label: 'Quotes',          icon: ClipboardList,    href: '/quotes' },
  { label: 'Pipeline',        icon: TrendingUp,       href: '/pipeline' },
  { label: 'Inventory',       icon: Package,          href: '/inventory' },
  { label: 'Reports',         icon: BarChart2,        href: '/reports' },
  { label: 'Tech Dashboard',  icon: UsersRound,       href: '/tech-dashboard' },
]

const ADMIN_ITEMS = [
  { label: 'Knowledge Base',      icon: BookOpen,  href: '/knowledge-base' },
  { label: 'Email Automations',   icon: Zap,       href: '/email-automations' },
  { label: 'Ticket Automations',  icon: Zap,       href: '/ticket-automations' },
  { label: 'Settings',            icon: Settings,  href: '/settings' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    // Load theme preference
    const saved = localStorage.getItem('theme')
    const isDark = saved === 'dark'
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)

    // Get current user
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
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

  const NavLink = ({ item }: { item: typeof NAV_ITEMS[0] }) => {
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
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => <NavLink key={item.href} item={item} />)}
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
          {!collapsed && (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Admin
            </p>
          )}
          {ADMIN_ITEMS.map(item => <NavLink key={item.href} item={item} />)}
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
          <p className="px-3 py-1 text-xs text-slate-400 truncate">{userEmail}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-56 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="p-1 rounded text-slate-500">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-900 dark:text-white text-sm">Valhalla RMM</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
