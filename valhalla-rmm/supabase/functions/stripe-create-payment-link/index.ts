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
    const { invoice_id } = await req.json()

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'invoice_id is required' }),
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

    // Fetch the invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const balanceDue = invoice.balance_due ?? invoice.total ?? 0

    if (balanceDue <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invoice is already paid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get or create Stripe customer for this customer
    let stripeCustomerId = null
    if (invoice.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('stripe_customer_id, name, contact_email')
        .eq('id', invoice.customer_id)
        .single()

      if (customer?.stripe_customer_id) {
        stripeCustomerId = customer.stripe_customer_id
      } else if (customer) {
        // Create Stripe customer
        const stripeCustomer = await stripe.customers.create({
          name:  customer.name,
          email: invoice.contact_email || customer.contact_email || undefined,
          metadata: { supabase_customer_id: invoice.customer_id },
        })
        stripeCustomerId = stripeCustomer.id

        // Save back to customers table
        await supabase
          .from('customers')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', invoice.customer_id)
      }
    }

    // Build line items from invoice
    const lineItems = Array.isArray(invoice.line_items) && invoice.line_items.length > 0
      ? invoice.line_items.map((item) => ({
          price_data: {
            currency: 'usd',
            product_data: {
              name: item.description || 'Service',
            },
            unit_amount: Math.round(Number(item.unit_price) * 100),
          },
          quantity: Number(item.quantity) || 1,
        }))
      : [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Invoice ${invoice.invoice_number}` },
            unit_amount: Math.round(balanceDue * 100),
          },
          quantity: 1,
        }]

    // Create Stripe Checkout session
    const appUrl = Deno.env.get('SUPABASE_URL')?.includes('supabase.co')
      ? 'https://project-mjonir.vercel.app'
      : 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId || undefined,
      customer_email: !stripeCustomerId ? (invoice.contact_email || undefined) : undefined,
      line_items: lineItems,
      metadata: {
        invoice_id,
        invoice_number: invoice.invoice_number,
        supabase_invoice_id: invoice_id,
      },
      success_url: `${appUrl}/invoices?payment=success&invoice=${invoice.invoice_number}`,
      cancel_url:  `${appUrl}/invoices?payment=cancelled`,
    })

    // Save payment URL back to invoice
    await supabase
      .from('invoices')
      .update({
        stripe_payment_url: session.url,
        status: invoice.status === 'draft' ? 'sent' : invoice.status,
      })
      .eq('id', invoice_id)

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})