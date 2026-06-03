// @ts-nocheck
// apps/web/src/app/(admin)/layout.tsx
// Server component — forces all (admin) pages to skip static prerendering
export const dynamic = 'force-dynamic'

import AdminLayoutClient from './admin-layout-client'
import QueryProvider from '@/providers/query-provider'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </QueryProvider>
  )
}
