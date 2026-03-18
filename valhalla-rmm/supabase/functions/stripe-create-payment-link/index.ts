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

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeKey    = Deno.env.get('STRIPE_SECRET_KEY')!

    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY secret is not set in Supabase Edge Function secrets')

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, amount_paid, status, line_items, contact_email, customer_id, customer_name')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) throw new Error(`Invoice not found: ${invErr?.message}`)

    // Compute amount — balance_due is computed so derive it manually
    const total      = Number(invoice.total ?? 0)
    const amountPaid = Number(invoice.amount_paid ?? 0)
    const balance    = Math.max(0, total - amountPaid)

    if (balance <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice is already paid' }),
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
        await supabase.from('customers').update({ stripe_customer_id: sc.id }).eq('id', invoice.customer_id)
      }
    }

    const appUrl = 'https://project-mjonir.vercel.app'

    // Build line items
    const rawItems = Array.isArray(invoice.line_items) && invoice.line_items.length > 0
      ? invoice.line_items
      : [{ description: `Invoice ${invoice.invoice_number}`, quantity: 1, unit_price: balance }]

    const sessionParams: Record<string, string> = {
      'mode':        'payment',
      'success_url': `${appUrl}/invoices?payment=success`,
      'cancel_url':  `${appUrl}/invoices?payment=cancelled`,
      'metadata[supabase_invoice_id]': invoice_id,
      'metadata[invoice_number]':      invoice.invoice_number,
    }

    if (stripeCustomerId) {
      sessionParams['customer'] = stripeCustomerId
    } else if (invoice.contact_email) {
      sessionParams['customer_email'] = invoice.contact_email
    }

    rawItems.forEach((item, i) => {
      const cents = Math.round(Number(item.unit_price ?? 0) * 100)
      const qty   = String(Math.max(1, Math.round(Number(item.quantity ?? 1))))
      const name  = String(item.description || 'Service').slice(0, 250)
      sessionParams[`line_items[${i}][price_data][currency]`]           = 'usd'
      sessionParams[`line_items[${i}][price_data][product_data][name]`] = name
      sessionParams[`line_items[${i}][price_data][unit_amount]`]        = String(cents)
      sessionParams[`line_items[${i}][quantity]`]                       = qty
    })

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