// @ts-nocheck
'use client'

import { useParams, useRouter } from 'next/navigation'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()

  return (
    <div className="p-8">
      <button onClick={() => router.push('/tickets')} className="text-amber-500 text-sm mb-4 block">← Back</button>
      <p className="text-white text-xl">Ticket ID: {params.id}</p>
    </div>
  )
}