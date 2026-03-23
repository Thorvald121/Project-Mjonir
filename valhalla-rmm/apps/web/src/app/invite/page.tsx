// @ts-nocheck
// This page handles invite link clicks from Supabase email invites.
// Supabase redirects to /invite after the user clicks their invite email.
// We immediately redirect to /auth/callback which will detect the session
// and route the user to /dashboard (staff) or /portal (client) based on role.
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Loader2 } from 'lucide-react'

export default function InvitePage() {
  const router   = useRouter()
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    const handle = async () => {
      // The invite token is in the URL hash — Supabase JS handles it automatically
      // Just wait for the session to be established, then route by role
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Session not ready yet — listen for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            subscription.unsubscribe()
            await routeByRole(session.user, supabase, router)
          }
        })
        return
      }

      await routeByRole(user, supabase, router)
    }
    handle()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      <p className="text-sm text-slate-500">Setting up your account…</p>
    </div>
  )
}

async function routeByRole(user, supabase, router) {
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const role    = member?.role ?? 'client'
  const isStaff = ['owner', 'admin', 'technician'].includes(role)
  router.push(isStaff ? '/dashboard' : '/portal')
}