// apps/web/src/app/page.tsx
// Root page — handles Supabase auth token hashes (recovery, invite)
// before middleware can redirect them away. Also handles normal role-based routing.
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2 } from 'lucide-react'

export default function RootPage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    const hash   = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    const type   = params.get('type')
    const token  = params.get('access_token')

    // If there's an auth token in the hash (recovery, invite, magic link)
    // set the session then send to set-password page
    if (token && (type === 'recovery' || type === 'invite' || type === 'signup')) {
      const refresh = params.get('refresh_token') || ''
      supabase.auth.setSession({ access_token: token, refresh_token: refresh })
        .then(({ error }) => {
          if (error) {
            router.replace('/portal/login?error=link_expired')
          } else {
            router.replace('/portal/set-password')
          }
        })
      return
    }

    // No token — normal role-based routing
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }
      // Check role
      supabase.from('organization_members')
        .select('role')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data }) => {
          const role    = data?.role ?? 'client'
          const isStaff = ['owner', 'admin', 'technician'].includes(role)
          router.replace(isStaff ? '/dashboard' : '/portal')
        })
    })
  }, [])

  // Show a blank loading screen while we figure out where to send the user
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
    </div>
  )
}