import { Suspense } from 'react'
import TicketDetailClient from './ticket-detail-client'

export default function TicketDetailPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 max-w-5xl">
        <div className="h-6 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    }>
      <TicketDetailClient />
    </Suspense>
  )
}
