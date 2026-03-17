// @valhalla/db — ticket query helpers
// Typed wrappers around Supabase queries.
// Used by packages/hooks to build TanStack Query hooks.

import { supabase } from '../client'
import type { Ticket, TicketStatus, TicketPriority } from '@valhalla/types'

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function getTickets(filters?: {
  status?: TicketStatus
  priority?: TicketPriority
  assigned_to?: string
  customer_id?: string
  limit?: number
}): Promise<Ticket[]> {
  let query = supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 200)

  if (filters?.status)      query = query.eq('status', filters.status)
  if (filters?.priority)    query = query.eq('priority', filters.priority)
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Ticket[]
}

export async function getTicketById(id: string): Promise<Ticket | null> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Ticket | null
}

// ── Mutate ────────────────────────────────────────────────────────────────────

export async function createTicket(
  ticket: Omit<Ticket, 'id' | 'created_at' | 'updated_at' | 'sla_due_date' | 'balance_due'>
): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .insert(ticket)
    .select()
    .single()

  if (error) throw error
  return data as Ticket
}

export async function updateTicket(
  id: string,
  updates: Partial<Omit<Ticket, 'id' | 'organization_id' | 'created_at'>>
): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Ticket
}

export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', id)

  if (error) throw error
}
