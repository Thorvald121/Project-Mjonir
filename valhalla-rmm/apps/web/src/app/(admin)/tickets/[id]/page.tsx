'use client'

import { Suspense } from 'react'
import TicketDetailClient from './ticket-detail-client'

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={
      <div className="space-y-4 max-w-5xl animate-pulse">
        <div className="h-5 w-36 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="h-10 w-2/3 bg-slate-100 dark:bg-slate-800 rounded" />
      </div>
    }>
      <TicketDetailClient />
    </Suspense>
  )
}