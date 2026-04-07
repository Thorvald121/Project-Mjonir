// @ts-nocheck
// supabase/functions/stripe-create-payment-link/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { invoice_id, partial_amount } = await req.json()
    // partial_amount: optional number in dollars for a custom partial payment

    if (!invoice_id) {
      return json({ error: 'invoice_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) return json({ error: 'Invoice not found' }, 404)

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const balanceDue = Math.max(0, (invoice.total || 0) - (invoice.amount_paid || 0))

    // Determine amount to charge
    const chargeAmount = partial_amount
      ? Math.min(Number(partial_amount), balanceDue) // can't pay more than balance
      : balanceDue

    const amountCents = Math.round(chargeAmount * 100)

    if (amountCents < 50) {
      return json({ error: 'Amount too small for Stripe (minimum $0.50)' }, 400)
    }

    const metadata = {
      invoice_id:      invoice.id,
      invoice_number:  invoice.invoice_number || '',
      customer_name:   invoice.customer_name  || '',
      organization_id: invoice.organization_id || '',
      is_partial:      partial_amount ? 'true' : 'false',
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://valhalla-rmm.com'

    if (partial_amount) {
      // ── Partial payment: use Checkout Session (one-time, custom amount) ──
      const session = await stripe.checkout.sessions.create({
        mode:         'payment',
        line_items: [{
          price_data: {
            currency:     'usd',
            unit_amount:  amountCents,
            product_data: {
              name: `Partial Payment — Invoice ${invoice.invoice_number}${invoice.customer_name ? ' (' + invoice.customer_name + ')' : ''}`,
              description: `Partial payment of $${chargeAmount.toFixed(2)} toward balance of $${balanceDue.toFixed(2)}`,
            },
          },
          quantity: 1,
        }],
        metadata,
        success_url: `${appUrl}/portal?payment=success`,
        cancel_url:  `${appUrl}/portal`,
      })

      return json({ url: session.url, type: 'checkout_session' })

    } else {
      // ── Full payment: use Payment Link (permanent, reusable) ──
      // Return existing link if already created for this exact balance
      if (invoice.stripe_payment_url && invoice.stripe_payment_url.includes('buy.stripe.com')) {
        return json({ url: invoice.stripe_payment_url, type: 'payment_link' })
      }

      const price = await stripe.prices.create({
        currency:     'usd',
        unit_amount:  amountCents,
        product_data: {
          name: `Invoice ${invoice.invoice_number}${invoice.customer_name ? ' — ' + invoice.customer_name : ''}`,
        },
      })

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata,
        after_completion: {
          type: 'hosted_confirmation',
          hosted_confirmation: {
            custom_message: `Thank you! Your payment for Invoice ${invoice.invoice_number} has been received.`,
          },
        },
      })

      // Save permanent URL to invoice
      await supabase
        .from('invoices')
        .update({ stripe_payment_url: paymentLink.url })
        .eq('id', invoice_id)

      return json({ url: paymentLink.url, type: 'payment_link' })
    }

  } catch (err) {
    console.error('Stripe error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}