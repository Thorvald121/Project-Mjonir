// @valhalla/utils — shared pure utilities
// No platform dependencies — works in Next.js, Expo, and Edge Functions.

import { format, formatDistanceToNow, isPast, differenceInHours, parseISO } from 'date-fns'
import type { TicketStatus, TicketPriority, InvoiceStatus } from '@valhalla/types'

// ── Date & Time ───────────────────────────────────────────────────────────────

export function formatDate(date: string | Date | null, fmt = 'MMM d, yyyy'): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date | null): string {
  return formatDate(date, 'MMM d, yyyy h:mm a')
}

export function timeAgo(date: string | Date | null): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── SLA ───────────────────────────────────────────────────────────────────────

export type SlaState = 'ok' | 'warning' | 'breached'

export function getSlaState(
  sla_due_date: string | null,
  status: TicketStatus
): SlaState {
  if (!sla_due_date) return 'ok'
  if (['resolved', 'closed'].includes(status)) return 'ok'
  const due = parseISO(sla_due_date)
  if (isPast(due)) return 'breached'
  if (differenceInHours(due, new Date()) < 4) return 'warning'
  return 'ok'
}

export function getSlaLabel(
  sla_due_date: string | null,
  status: TicketStatus
): string {
  if (!sla_due_date) return '—'
  if (['resolved', 'closed'].includes(status)) return 'Met'
  const due = parseISO(sla_due_date)
  if (isPast(due)) return 'Breached'
  const hoursLeft = differenceInHours(due, new Date())
  if (hoursLeft < 1) return '<1h left'
  return `${hoursLeft}h left`
}

// ── Currency ──────────────────────────────────────────────────────────────────

export function formatCurrency(
  amount: number | null | undefined,
  currency = 'USD'
): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// ── Status Labels & Colors ────────────────────────────────────────────────────

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  waiting:     'Waiting',
  resolved:    'Resolved',
  closed:      'Closed',
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:   'Draft',
  sent:    'Sent',
  paid:    'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  void:    'Void',
}

// ── Strings ───────────────────────────────────────────────────────────────────

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/** Replace {{contact_name}}, {{ticket_title}}, {{customer_name}} in canned reply templates */
export function interpolate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ── Invoice Calculations ──────────────────────────────────────────────────────

export function computeInvoiceTotals(
  lineItems: { quantity: number; unit_price: number }[],
  taxRate = 0,
  discountAmount = 0,
  discountPercent = 0
) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const pctDiscount = subtotal * (discountPercent / 100)
  const totalDiscount = discountAmount + pctDiscount
  const taxable = subtotal - totalDiscount
  const taxAmount = taxable * (taxRate / 100)
  const total = taxable + taxAmount
  return { subtotal, taxAmount, total: Math.max(0, total) }
}

// ── Arrays ────────────────────────────────────────────────────────────────────

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((groups, item) => {
    const group = String(item[key])
    return { ...groups, [group]: [...(groups[group] ?? []), item] }
  }, {} as Record<string, T[]>)
}
