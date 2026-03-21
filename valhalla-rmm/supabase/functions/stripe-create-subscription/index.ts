import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function stripeRequest(path: string, body: Record<string, unknown>) {
  const key = Deno.env.get('STRIPE_SECRET_KEY')!
  const encoded = Object.entries(flattenParams(body))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
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

function flattenParams(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenParams(value as Record<string, unknown>, fullKey))
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
    const { customer_id, monthly_rate, description } = await req.json()
    if (!customer_id || !monthly_rate) {
      return new Response(JSON.stringify({ error: 'customer_id and monthly_rate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: customer, error: custErr } = await supabase
      .from('customers').select('*').eq('id', customer_id).single()
    if (custErr || !customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get or create Stripe customer
    let stripeCustomerId = customer.stripe_customer_id
    if (!stripeCustomerId) {
      const sc = await stripeRequest('/customers', {
        name:  customer.name,
        email: customer.contact_email || undefined,
        'metadata[supabase_customer_id]': customer_id,
      })
      stripeCustomerId = sc.id
      await supabase.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', customer_id)
    }

    // Create price
    const price = await stripeRequest('/prices', {
      currency:   'usd',
      unit_amount: Math.round(Number(monthly_rate) * 100),
      'recurring[interval]': 'month',
      'product_data[name]': description || `Managed Services — ${customer.name}`,
    })

    const appUrl = 'https://project-mjonir.vercel.app'

    // Create checkout session for subscription
    const session = await stripeRequest('/checkout/sessions', {
      mode:         'subscription',
      customer:     stripeCustomerId,
      'line_items[0][price]':    price.id,
      'line_items[0][quantity]': '1',
      'metadata[supabase_customer_id]': customer_id,
      'metadata[customer_name]':        customer.name,
      success_url: `${appUrl}/customers/${customer_id}?subscription=success`,
      cancel_url:  `${appUrl}/customers/${customer_id}?subscription=cancelled`,
    })

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})