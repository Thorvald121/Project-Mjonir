'use client'

import { useQuery } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Ticket, FileText, BookOpen, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function PortalPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const { data: user } = useQuery({
    queryKey: ['portal-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: Infinity,
  })

  const { data: tickets = [] } = useQuery({
    queryKey: ['portal-tickets'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('id, title, status, priority, created_at')
        .eq('contact_email', user?.email ?? '')
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!user?.email,
  })

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/portal/login')
  }

  const statusColor: Record<string, string> = {
    open:        'bg-blue-100 text-blue-700',
    in_progress: 'bg-violet-100 text-violet-700',
    waiting:     'bg-amber-100 text-amber-700',
    resolved:    'bg-emerald-100 text-emerald-700',
    closed:      'bg-slate-100 text-slate-500',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-sm">Client Portal</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            View your support tickets and invoices below.
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'New Ticket',     icon: Ticket,   color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/30' },
            { label: 'Invoices',       icon: FileText,  color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/30' },
            { label: 'Knowledge Base', icon: BookOpen,  color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30' },
          ].map(item => (
            <button
              key={item.label}
              className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-300 transition-colors"
            >
              <div className={`w-10 h-10 rounded-full ${item.bg} flex items-center justify-center`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Recent tickets */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-sm text-slate-900 dark:text-white">Your Tickets</h2>
          </div>
          {tickets.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No tickets yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {tickets.map((t: any) => (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor[t.status] ?? 'bg-slate-100 text-slate-500'}`}>
                    {t.status?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
