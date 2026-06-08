// @ts-nocheck
// apps/web/src/providers/org-provider.tsx
//
// Fetches the current user's org a single time when the admin layout mounts.
// All child pages read from this context instantly — zero network calls per navigation.
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

interface OrgContextValue {
  orgId:     string | null
  org:       Record<string, any>
  userEmail: string | null
  ready:     boolean  // true once the initial fetch is complete
}

const OrgContext = createContext<OrgContextValue>({
  orgId:     null,
  org:       {},
  userEmail: null,
  ready:     false,
})

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseBrowserClient()
  const [orgId,     setOrgId]     = useState<string | null>(null)
  const [org,       setOrg]       = useState<Record<string, any>>({})
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [ready,     setReady]     = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setReady(true); return }

      setUserEmail(user.email ?? null)

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) { setReady(true); return }

      setOrgId(member.organization_id)

      const { data: orgData } = await supabase
        .from('organizations')
        .select('name,company_email,brand_color,logo_url')
        .eq('id', member.organization_id)
        .single()

      if (orgData) setOrg(orgData)
      setReady(true)
    }
    load()
  }, [])

  return (
    <OrgContext.Provider value={{ orgId, org, userEmail, ready }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrgContext() {
  return useContext(OrgContext)
}
