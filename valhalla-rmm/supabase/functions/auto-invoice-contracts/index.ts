// @ts-nocheck
// Runs daily via pg_cron. Finds active contracts due for billing and creates
// draft invoices. Skips contracts with no value or already invoiced this period.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Allow manual trigger for a specific contract
    let body = {}
    try { body = await req.json() } catch {}
    const specificId = body.contract_id || null

    const now     = new Date()
    const today   = now.toISOString().slice(0, 10)

    // Fetch active contracts with a value and billing cycle
    const query = supabase
      .from('contracts')
      .select('*')
      .eq('status', 'active')
      .not('value', 'is', null)
      .not('billing_cycle', 'eq', 'one_time')
      .not('start_date', 'is', null)

    if (specificId) query.eq('id', specificId)

    const { data: contracts, error } = await query
    if (error) throw error
    if (!contracts?.length) return ok('no contracts to process')

    const invoiced  = []
    const skipped   = []

    for (const contract of contracts) {
      const due = isInvoiceDue(contract, now)
      if (!due && !specificId) {
        skipped.push(contract.id)
        continue
      }

      // Create draft invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`
      const dueDate       = addDays(now, 30).toISOString().slice(0, 10)
      const periodLabel   = getPeriodLabel(contract, now)

      const { error: invErr } = await supabase.from('invoices').insert({
        organization_id: contract.organization_id,
        invoice_number:  invoiceNumber,
        customer_id:     contract.customer_id,
        customer_name:   contract.customer_name,
        status:          'draft',
        payment_terms:   'net_30',
        issue_date:      today,
        due_date:        dueDate,
        line_items:      [{
          description: `${contract.title} — ${periodLabel}`,
          quantity:    1,
          unit_price:  contract.value,
        }],
        subtotal:        contract.value,
        total:           contract.value,
        amount_paid:     0,
        notes:           `Auto-generated from contract: ${contract.title}`,
      })

      if (invErr) {
        console.error(`Failed to invoice contract ${contract.id}:`, invErr.message)
        continue
      }

      // Update last_invoiced_at and compute next_invoice_date
      const nextDate = getNextInvoiceDate(contract, now)
      await supabase.from('contracts').update({
        last_invoiced_at:  now.toISOString(),
        next_invoice_date: nextDate,
      }).eq('id', contract.id)

      invoiced.push(contract.id)
      console.log(`Invoiced contract ${contract.id} (${contract.title}) → ${invoiceNumber}`)
    }

    return ok(`invoiced ${invoiced.length}, skipped ${skipped.length}`)
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// Is this contract due for a new invoice today?
function isInvoiceDue(contract, now) {
  const start = new Date(contract.start_date)
  if (isNaN(start.getTime())) return false

  // If end_date is in the past, don't invoice
  if (contract.end_date && new Date(contract.end_date) < now) return false

  // If never invoiced, check if the start date has passed
  if (!contract.last_invoiced_at) {
    return start <= now
  }

  const last        = new Date(contract.last_invoiced_at)
  const daysSinceLast = (now - last) / 86400000

  switch (contract.billing_cycle) {
    case 'monthly':   return daysSinceLast >= 28  // allow a 2-day window
    case 'quarterly': return daysSinceLast >= 88
    case 'annually':  return daysSinceLast >= 363
    default:          return false
  }
}

function getNextInvoiceDate(contract, now) {
  const next = new Date(now)
  switch (contract.billing_cycle) {
    case 'monthly':   next.setMonth(next.getMonth() + 1); break
    case 'quarterly': next.setMonth(next.getMonth() + 3); break
    case 'annually':  next.setFullYear(next.getFullYear() + 1); break
  }
  return next.toISOString().slice(0, 10)
}

function getPeriodLabel(contract, now) {
  const month = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  switch (contract.billing_cycle) {
    case 'monthly':   return `${month} retainer`
    case 'quarterly': return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()} retainer`
    case 'annually':  return `${now.getFullYear()} annual retainer`
    default:          return 'retainer'
  }
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}