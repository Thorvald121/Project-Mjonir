import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`)
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { invoice_id } = await req.json()
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured')

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status, contact_email, customer_id, customer_name')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) throw new Error(`Invoice not found: ${invErr?.message}`)

    // Always use total - amount_paid for balance (balance_due is computed)
    const total      = Number(invoice.total ?? 0)
    const amountPaid = Number(invoice.amount_paid ?? 0)
    const balance    = Math.max(0, total - amountPaid)

    if (balance <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice balance is zero — already paid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined
    if (invoice.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('stripe_customer_id, name, contact_email')
        .eq('id', invoice.customer_id)
        .single()

      if (cust?.stripe_customer_id) {
        stripeCustomerId = cust.stripe_customer_id
      } else if (cust) {
        const custParams: Record<string, string> = { name: cust.name }
        const email = invoice.contact_email || cust.contact_email
        if (email) custParams['email'] = email
        custParams['metadata[supabase_customer_id]'] = invoice.customer_id
        const sc = await stripePost('/customers', custParams)
        stripeCustomerId = sc.id
        await supabase.from('customers')
          .update({ stripe_customer_id: sc.id })
          .eq('id', invoice.customer_id)
      }
    }

    const appUrl = 'https://project-mjonir.vercel.app'

    // Always send ONE line item for the invoice total
    // This avoids rounding issues with fractional hours
    const sessionParams: Record<string, string> = {
      'mode':        'payment',
      'success_url': `${appUrl}/invoices?payment=success`,
      'cancel_url':  `${appUrl}/invoices?payment=cancelled`,
      'metadata[supabase_invoice_id]': invoice_id,
      'metadata[invoice_number]':      invoice.invoice_number,
      // Single line item = total balance due
      'line_items[0][price_data][currency]':                  'usd',
      'line_items[0][price_data][product_data][name]':        `Invoice ${invoice.invoice_number} — ${invoice.customer_name || ''}`,
      'line_items[0][price_data][unit_amount]':               String(Math.round(balance * 100)),
      'line_items[0][quantity]':                              '1',
    }

    if (stripeCustomerId) {
      sessionParams['customer'] = stripeCustomerId
    } else if (invoice.contact_email) {
      sessionParams['customer_email'] = invoice.contact_email
    }

    const session = await stripePost('/checkout/sessions', sessionParams)

    // Save URL to invoice
    await supabase.from('invoices').update({
      stripe_payment_url: session.url,
      status: invoice.status === 'draft' ? 'sent' : invoice.status,
    }).eq('id', invoice_id)

    return new Response(JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})