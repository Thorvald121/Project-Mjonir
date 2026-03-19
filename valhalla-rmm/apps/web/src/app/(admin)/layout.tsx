// Server component — forces all (admin) pages to skip static prerendering
export const dynamic = 'force-dynamic'

import AdminLayoutClient from './admin-layout-client'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}