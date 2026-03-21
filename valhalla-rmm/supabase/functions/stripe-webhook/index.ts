import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const v1Part = parts.find(p => p.startsWith('v1='))
  if (!tPart || !v1Part) return false

  const timestamp = tPart.slice(2)
  const signature = v1Part.slice(3)
  const signedPayload = `${timestamp}.${payload}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === signature
}

serve(async (req) => {
  const signature = req.headers.get('stripe-signature') || ''
  const body = await req.text()

  const isValid = await verifyStripeSignature(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!)
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  const event = JSON.parse(body)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        const invoiceId = session.metadata?.supabase_invoice_id || session.metadata?.invoice_id

        if (invoiceId && session.payment_status === 'paid') {
          const amountPaid = (session.amount_total ?? 0) / 100
          await supabase.from('invoices').update({
            status:      'paid',
            amount_paid: amountPaid,
            paid_date:   new Date().toISOString().split('T')[0],
            stripe_charge_id: session.payment_intent,
          }).eq('id', invoiceId)
        }

        if (session.mode === 'subscription' && session.subscription) {
          const customerId = session.metadata?.supabase_customer_id
          if (customerId) {
            await supabase.from('customers').update({
              stripe_subscription_id: session.subscription,
            }).eq('id', customerId)
          }
        }
        break
      }

      case 'invoice.paid': {
        const stripeInvoice = event.data.object
        const stripeCustomerId = stripeInvoice.customer

        const { data: customer } = await supabase
          .from('customers').select('id, name, contact_email, monthly_rate, organization_id')
          .eq('stripe_customer_id', stripeCustomerId).single()

        if (customer && stripeInvoice.billing_reason === 'subscription_cycle') {
          const amount = (stripeInvoice.amount_paid ?? 0) / 100
          const invNum = `INV-${Date.now().toString().slice(-6)}`
          await supabase.from('invoices').insert({
            organization_id: customer.organization_id,
            invoice_number:  invNum,
            customer_id:     customer.id,
            customer_name:   customer.name,
            contact_email:   customer.contact_email,
            status:          'paid',
            issue_date:      new Date().toISOString().split('T')[0],
            due_date:        new Date().toISOString().split('T')[0],
            payment_terms:   'due_on_receipt',
            line_items:      [{ description: 'Managed Services — Monthly', quantity: 1, unit_price: amount, total: amount }],
            subtotal:        amount,
            tax_rate:        0,
            tax_amount:      0,
            discount_amount: 0,
            discount_percent: 0,
            total:           amount,
            amount_paid:     amount,
            paid_date:       new Date().toISOString().split('T')[0],
            is_recurring:    true,
            recurrence_interval: 'monthly',
            stripe_charge_id: stripeInvoice.payment_intent,
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object
        const { data: customer } = await supabase
          .from('customers').select('id').eq('stripe_customer_id', stripeInvoice.customer).single()
        if (customer) {
          await supabase.from('invoices').update({ status: 'overdue' })
            .eq('customer_id', customer.id).eq('status', 'sent')
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object
        await supabase.from('customers').update({
          stripe_subscription_id: sub.id,
          stripe_plan: sub.items?.data?.[0]?.price?.id || null,
        }).eq('stripe_customer_id', sub.customer)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase.from('customers').update({
          stripe_subscription_id: null,
          stripe_plan: null,
        }).eq('stripe_customer_id', sub.customer)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})