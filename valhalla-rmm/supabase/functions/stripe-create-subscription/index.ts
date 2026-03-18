import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { customer_id, monthly_rate, description } = await req.json()

    if (!customer_id || !monthly_rate) {
      return new Response(
        JSON.stringify({ error: 'customer_id and monthly_rate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2023-10-16',
    })

    // Fetch customer
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single()

    if (custErr || !customer) {
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get or create Stripe customer
    let stripeCustomerId = customer.stripe_customer_id

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        name:  customer.name,
        email: customer.contact_email || undefined,
        metadata: { supabase_customer_id: customer_id },
      })
      stripeCustomerId = stripeCustomer.id

      await supabase
        .from('customers')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', customer_id)
    }

    // Create a price for this subscription
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(Number(monthly_rate) * 100),
      recurring: { interval: 'month' },
      product_data: {
        name: description || `Managed Services — ${customer.name}`,
      },
    })

    // Create a subscription with a 30-day trial so billing starts next month
    // and return a setup URL so the client can add their card
    const appUrl = 'https://project-mjonir.vercel.app'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        supabase_customer_id: customer_id,
        customer_name: customer.name,
      },
      success_url: `${appUrl}/customers/${customer_id}?subscription=success`,
      cancel_url:  `${appUrl}/customers/${customer_id}?subscription=cancelled`,
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})