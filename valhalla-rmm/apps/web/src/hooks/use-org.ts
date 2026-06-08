// @ts-nocheck
// apps/web/src/hooks/use-org.ts
//
// Caches the current user's org info for the entire session.
// staleTime: Infinity = fetched once, never refetched.
// Every page that calls useOrg() after the first gets instant results from cache.

import { useQuery } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function useOrg() {
  const supabase = createSupabaseBrowserClient()

  return useQuery({
    queryKey:  ['__org__'],
    staleTime: Infinity,   // org never changes mid-session
    gcTime:    Infinity,   // keep in cache until page is closed
    queryFn:   async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (!member) return null

      const { data: org } = await supabase
        .from('organizations')
        .select('name,company_email,brand_color,logo_url')
        .eq('id', member.organization_id)
        .single()

      return {
        orgId: member.organization_id,
        org:   org ?? {},
        email: user.email,
      }
    },
  })
}