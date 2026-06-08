// @ts-nocheck
// apps/web/src/hooks/use-org.ts
//
// Reads org data from OrgContext — instant, no network call.
// OrgProvider in the admin layout has already done the fetch once.

import { useOrgContext } from '@/providers/org-provider'

export function useOrg() {
  const { orgId, org, userEmail, ready } = useOrgContext()

  return {
    data:      ready && orgId ? { orgId, org, email: userEmail } : undefined,
    isPending: !ready,
  }
}
