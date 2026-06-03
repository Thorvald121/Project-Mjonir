// @ts-nocheck
'use client'
// apps/web/src/providers/query-provider.tsx
// Wraps the admin layout with TanStack Query's QueryClientProvider.
// staleTime: 30s — data considered fresh, no background refetch needed
// gcTime:    5m  — unused queries stay in memory for 5 minutes
// refetchOnWindowFocus: true — refreshes stale data when user switches back to the tab

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function QueryProvider({ children }) {
  // useState so each browser session gets its own QueryClient instance
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime:            30 * 1000,      // 30 seconds
          gcTime:               5 * 60 * 1000,  // 5 minutes
          refetchOnWindowFocus: true,
          retry:                1,
        },
      },
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
