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

    // Fetch active contracts with auto_invoice enabled
    const query = supabase
      .from('contracts')
      .select('*')
      .eq('status', 'active')
      .eq('auto_invoice', true)
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

      invoiced.push({ id: contract.id, title: contract.title, invoice: invoiceNumber, customer: contract.customer_name })
      console.log(`Invoiced contract ${contract.id} (${contract.title}) → ${invoiceNumber}`)
    }

    // Send summary email to admin if any invoices were created
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_KEY && invoiced.length > 0) {
      const rows = invoiced.map(i =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;">${i.customer || '—'}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;">${i.title}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">${i.invoice}</td></tr>`
      ).join('')
      const APP_URL = Deno.env.get('APP_URL') || 'https://valhalla-rmm.com'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'Valhalla IT <support@valhalla-it.net>',
          to:      ['admin@valhalla-it.net'],
          subject: `${invoiced.length} draft invoice${invoiced.length > 1 ? 's' : ''} created from contracts`,
          html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
  <div style="background:#0f172a;padding:16px 20px;border-radius:12px 12px 0 0;border-left:5px solid #f59e0b;">
    <h2 style="color:#f59e0b;margin:0;font-size:15px;">Contract Auto-Invoicing</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">${invoiced.length} draft invoice${invoiced.length > 1 ? 's' : ''} created — ${today}</p>
  </div>
  <div style="background:#fff;padding:16px 20px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:13px;color:#475569;margin:0 0 12px;">The following draft invoices were automatically created and are ready for review:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Customer</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Contract</th>
        <th style="padding:6px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Invoice #</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;text-align:center;">
      <a href="${APP_URL}/invoices" style="background:#f59e0b;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Review Invoices →</a>
    </div>
  </div>
</div>`,
        }),
      }).catch(e => console.error('Summary email failed:', e.message))
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