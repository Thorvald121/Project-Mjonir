// @ts-nocheck
// supabase/functions/stripe-webhook/index.ts
// Receives Stripe webhook events and updates invoice status automatically.
// Handles: payment_link.completed, checkout.session.completed, payment_intent.succeeded
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'

serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const signature     = req.headers.get('stripe-signature')
    const body          = await req.text()

    // Verify the webhook signature to ensure it's really from Stripe
    let event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    console.log('Stripe event received:', event.type)

    // ── Handle payment events ─────────────────────────────────────────────────
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'payment_link.completed'
    ) {
      const session   = event.data.object
      const invoiceId = session.metadata?.invoice_id
      const amountPaid = (session.amount_total || 0) / 100 // convert cents to dollars

      if (!invoiceId) {
        console.log('No invoice_id in metadata, skipping')
        return ok()
      }

      if (session.payment_status !== 'paid') {
        console.log('Payment status is not paid:', session.payment_status)
        return ok()
      }

      await processPayment(supabase, invoiceId, amountPaid, session.id, 'stripe')
    }

    // Also handle direct payment_intent.succeeded (for manual charges, etc.)
    if (event.type === 'payment_intent.succeeded') {
      const intent    = event.data.object
      const invoiceId = intent.metadata?.invoice_id
      const amountPaid = (intent.amount_received || 0) / 100

      if (!invoiceId) {
        console.log('No invoice_id in metadata, skipping')
        return ok()
      }

      await processPayment(supabase, invoiceId, amountPaid, intent.id, 'stripe')
    }

    return ok()
  } catch (err) {
    console.error('Webhook error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function processPayment(supabase, invoiceId, amountPaid, stripeRef, source) {
  // Fetch the current invoice
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, total, amount_paid, status, invoice_number, customer_name, organization_id')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) {
    console.error('Invoice not found:', invoiceId)
    return
  }

  // Prevent double-processing the same Stripe reference
  const { data: existing } = await supabase
    .from('invoice_payments')
    .select('id')
    .eq('stripe_ref', stripeRef)
    .maybeSingle()

  if (existing) {
    console.log('Payment already processed:', stripeRef)
    return
  }

  // Record the individual payment
  await supabase.from('invoice_payments').insert({
    invoice_id:      invoiceId,
    organization_id: invoice.organization_id,
    amount:          amountPaid,
    source,
    stripe_ref:      stripeRef,
    paid_at:         new Date().toISOString(),
  })

  // Calculate new total paid
  const newAmountPaid = Number(invoice.amount_paid || 0) + amountPaid
  const total         = Number(invoice.total || 0)
  const balance       = Math.max(0, total - newAmountPaid)

  // Determine new status
  let newStatus
  if (balance <= 0.01) {        // fully paid (allow 1 cent rounding tolerance)
    newStatus = 'paid'
  } else if (newAmountPaid > 0) {
    newStatus = 'partial'       // partial payment made
  } else {
    newStatus = invoice.status  // unchanged
  }

  // Update invoice
  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      amount_paid: newAmountPaid,
      status:      newStatus,
      paid_at:     newStatus === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', invoiceId)

  if (updateErr) {
    console.error('Failed to update invoice:', updateErr.message)
    return
  }

  console.log(
    `Invoice ${invoice.invoice_number}: paid $${amountPaid}, ` +
    `total paid $${newAmountPaid}/${total}, status → ${newStatus}`
  )
}

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}