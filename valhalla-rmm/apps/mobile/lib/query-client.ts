// apps/mobile/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           60_000,   // 1 minute
      retry:               1,
      refetchOnWindowFocus: false,   // no window in RN
    },
  },
})
