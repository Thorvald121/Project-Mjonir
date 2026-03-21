import { useEffect, useRef } from 'react'

/**
 * useRealtimeRefresh — listens for the global 'supabase:change' DOM event
 * emitted by the admin layout and calls the refresh function when any of
 * the specified tables change.
 *
 * Usage:
 *   useRealtimeRefresh(['tickets', 'ticket_comments'], loadAll)
 *   useRealtimeRefresh(['invoices'], loadAll)
 *   useRealtimeRefresh([], loadAll) // refresh on any table change
 */
export function useRealtimeRefresh(tables: string[], onRefresh: () => void) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent<{ table: string; event: string }>
      // If no tables specified or the changed table is in our list — refresh
      if (tables.length === 0 || tables.includes(event.detail?.table)) {
        onRefreshRef.current()
      }
    }

    window.addEventListener('supabase:change', handler)
    return () => window.removeEventListener('supabase:change', handler)
  }, [tables.join(',')])
}