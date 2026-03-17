// @valhalla/hooks — useTickets
// Shared TanStack Query hooks used by both apps/web and apps/mobile.
// Same hook, same cache key, same invalidation — zero duplication.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTickets, getTicketById, createTicket, updateTicket, deleteTicket
} from '@valhalla/db'
import type { Ticket, TicketStatus, TicketPriority } from '@valhalla/types'

// ── Query Keys ────────────────────────────────────────────────────────────────
// Centralised here so web and mobile always invalidate the same keys.
export const ticketKeys = {
  all:     ['tickets'] as const,
  lists:   () => [...ticketKeys.all, 'list'] as const,
  list:    (filters: object) => [...ticketKeys.lists(), filters] as const,
  detail:  (id: string) => [...ticketKeys.all, 'detail', id] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTickets(filters?: {
  status?: TicketStatus
  priority?: TicketPriority
  assigned_to?: string
  customer_id?: string
  limit?: number
}) {
  return useQuery({
    queryKey: ticketKeys.list(filters ?? {}),
    queryFn:  () => getTickets(filters),
    staleTime: 60_000,  // 1 minute — set globally in QueryClient too
  })
}

export function useMyTickets(userEmail: string | undefined) {
  return useQuery({
    queryKey: ticketKeys.list({ assigned_to: userEmail }),
    queryFn:  () => getTickets({ assigned_to: userEmail }),
    enabled:  !!userEmail,
    staleTime: 60_000,
  })
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ticketKeys.detail(id!),
    queryFn:  () => getTicketById(id!),
    enabled:  !!id,
    staleTime: 60_000,
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all })
    },
  })
}

export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Ticket> }) =>
      updateTicket(id, updates),
    onSuccess: (data) => {
      // Update the detail cache immediately without a refetch
      qc.setQueryData(ticketKeys.detail(data.id), data)
      qc.invalidateQueries({ queryKey: ticketKeys.lists() })
    },
  })
}

export function useDeleteTickets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(deleteTicket)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all })
    },
  })
}
