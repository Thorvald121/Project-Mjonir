// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { invoice_id } = await req.json()

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If a permanent payment link already exists, return it
    if (invoice.stripe_payment_url && invoice.stripe_payment_url.includes('buy.stripe.com')) {
      return new Response(JSON.stringify({ url: invoice.stripe_payment_url }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const balanceDue = Math.max(0, (invoice.total || 0) - (invoice.amount_paid || 0))
    const amountCents = Math.round(balanceDue * 100)

    if (amountCents < 50) {
      return new Response(JSON.stringify({ error: 'Amount too small for Stripe (minimum $0.50)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create a Stripe Price (one-time, for this invoice amount)
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: amountCents,
      product_data: {
        name: `Invoice ${invoice.invoice_number}${invoice.customer_name ? ' — ' + invoice.customer_name : ''}`,
      },
    })

    // Create a permanent Payment Link (never expires, unlike Checkout Sessions)
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        invoice_id:      invoice.id,
        invoice_number:  invoice.invoice_number,
        customer_name:   invoice.customer_name || '',
        organization_id: invoice.organization_id || '',
      },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Thank you! Your payment for ${invoice.invoice_number} has been received. You will receive a confirmation shortly.`,
        },
      },
    })

    // Save the permanent URL back to the invoice
    await supabase
      .from('invoices')
      .update({ stripe_payment_url: paymentLink.url })
      .eq('id', invoice_id)

    return new Response(JSON.stringify({ url: paymentLink.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Stripe error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})