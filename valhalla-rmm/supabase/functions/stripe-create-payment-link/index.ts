import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function stripeRequest(path: string, method: string, body?: Record<string, unknown>) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!
  const encoded = body
    ? Object.entries(flattenStripeParams(body))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : undefined

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encoded,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe error: ${res.status}`)
  return data
}

function flattenStripeParams(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenStripeParams(value as Record<string, unknown>, fullKey))
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(result, flattenStripeParams(item as Record<string, unknown>, `${fullKey}[${i}]`))
        } else {
          result[`${fullKey}[${i}]`] = String(item)
        }
      })
    } else {
      result[fullKey] = String(value)
    }
  }
  return result
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

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices').select('*').eq('id', invoice_id).single()
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const balanceDue = invoice.balance_due ?? invoice.total ?? 0
    if (balanceDue <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice is already paid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined
    if (invoice.customer_id) {
      const { data: customer } = await supabase
        .from('customers').select('stripe_customer_id, name, contact_email').eq('id', invoice.customer_id).single()

      if (customer?.stripe_customer_id) {
        stripeCustomerId = customer.stripe_customer_id
      } else if (customer) {
        const sc = await stripeRequest('/customers', 'POST', {
          name:  customer.name,
          email: invoice.contact_email || customer.contact_email || undefined,
          metadata: { supabase_customer_id: invoice.customer_id },
        })
        stripeCustomerId = sc.id
        await supabase.from('customers').update({ stripe_customer_id: sc.id }).eq('id', invoice.customer_id)
      }
    }

    const appUrl = 'https://project-mjonir.vercel.app'

    // Build line items — Stripe checkout uses indexed params
    const items = Array.isArray(invoice.line_items) && invoice.line_items.length > 0
      ? invoice.line_items
      : [{ description: `Invoice ${invoice.invoice_number}`, quantity: 1, unit_price: balanceDue }]

    const sessionParams: Record<string, unknown> = {
      mode: 'payment',
      'success_url': `${appUrl}/invoices?payment=success&invoice=${invoice.invoice_number}`,
      'cancel_url':  `${appUrl}/invoices?payment=cancelled`,
      'metadata[invoice_id]':        invoice_id,
      'metadata[invoice_number]':    invoice.invoice_number,
      'metadata[supabase_invoice_id]': invoice_id,
    }

    if (stripeCustomerId) {
      sessionParams['customer'] = stripeCustomerId
    } else if (invoice.contact_email) {
      sessionParams['customer_email'] = invoice.contact_email
    }

    // Add line items
    items.forEach((item, i) => {
      const total = Number(item.quantity) * Number(item.unit_price)
      sessionParams[`line_items[${i}][price_data][currency]`]                  = 'usd'
      sessionParams[`line_items[${i}][price_data][product_data][name]`]        = item.description || 'Service'
      sessionParams[`line_items[${i}][price_data][unit_amount]`]               = Math.round(Number(item.unit_price) * 100)
      sessionParams[`line_items[${i}][quantity]`]                              = Number(item.quantity)
    })

    const session = await stripeRequest('/checkout/sessions', 'POST', sessionParams)

    // Save URL back to invoice
    await supabase.from('invoices').update({
      stripe_payment_url: session.url,
      status: invoice.status === 'draft' ? 'sent' : invoice.status,
    }).eq('id', invoice_id)

    return new Response(JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})