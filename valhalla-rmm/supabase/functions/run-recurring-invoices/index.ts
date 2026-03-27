// @ts-nocheck
// Runs daily via pg_cron. Finds sent/paid invoices marked is_recurring=true
// where the recurrence is due, clones them as a new draft, and stamps
// last_recurring_at so we don't double-generate.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const now   = new Date()
    const today = now.toISOString().slice(0, 10)

    // Allow manual trigger for a specific invoice
    let body: any = {}
    try { body = await req.json() } catch {}
    const specificId = body.invoice_id || null

    const query = supabase
      .from('invoices')
      .select('*')
      .eq('is_recurring', true)
      .not('recurrence_interval', 'is', null)

    if (specificId) query.eq('id', specificId)

    const { data: invoices, error } = await query
    if (error) throw error
    if (!invoices?.length) return ok('no recurring invoices to process')

    const generated = []
    const skipped   = []

    for (const inv of invoices) {
      if (!isDue(inv, now) && !specificId) { skipped.push(inv.id); continue }

      const newNum = `INV-${Date.now().toString().slice(-6)}`
      const newDue = addDays(now, 30).toISOString().slice(0, 10)

      const noteLines = [
        inv.notes,
        `Auto-generated from recurring invoice ${inv.invoice_number}`
      ].filter(Boolean).join('\n')

      const { error: insertErr } = await supabase.from('invoices').insert({
        organization_id:     inv.organization_id,
        invoice_number:      newNum,
        customer_id:         inv.customer_id,
        customer_name:       inv.customer_name,
        status:              'draft',
        payment_terms:       inv.payment_terms,
        issue_date:          today,
        due_date:            newDue,
        line_items:          inv.line_items,
        subtotal:            inv.subtotal,
        tax_rate:            inv.tax_rate,
        tax_amount:          inv.tax_amount,
        total:               inv.total,
        amount_paid:         0,
        notes:               noteLines,
        is_recurring:        true,
        recurrence_interval: inv.recurrence_interval,
      })

      if (insertErr) {
        console.error(`Failed to clone invoice ${inv.id}:`, insertErr.message)
        continue
      }

      await supabase.from('invoices')
        .update({ last_recurring_at: now.toISOString() })
        .eq('id', inv.id)

      generated.push(inv.invoice_number)
      console.log(`Generated recurring invoice from ${inv.invoice_number} → ${newNum}`)
    }

    return ok(`generated ${generated.length}, skipped ${skipped.length}`)
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

function isDue(inv: any, now: Date): boolean {
  const baseline = inv.last_recurring_at
    ? new Date(inv.last_recurring_at)
    : inv.due_date
    ? new Date(inv.due_date)
    : new Date(inv.issue_date)

  if (isNaN(baseline.getTime())) return false
  const daysSince = (now.getTime() - baseline.getTime()) / 86400000

  switch (inv.recurrence_interval) {
    case 'monthly':   return daysSince >= 28
    case 'quarterly': return daysSince >= 88
    case 'annually':  return daysSince >= 363
    default:          return false
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function ok(msg: string) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}