// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { from, to, subject, body, html } = await req.json()

    console.log('Inbound email from:', from, 'subject:', subject)

    if (!from || !subject) {
      return new Response(JSON.stringify({ error: 'Missing from or subject' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // ── Try to find ticket by ID embedded in subject ──────────────────────
    // We embed ticket IDs in outbound email subjects as: [#ticket_id]
    // e.g. "Re: Your ticket is being worked on [#a1b2c3d4-...]"
    let ticketId = null
    const idMatch = subject.match(/\[#([a-f0-9-]{36})\]/i)
    if (idMatch) {
      ticketId = idMatch[1]
      console.log('Found ticket ID in subject:', ticketId)
    }

    // ── Fallback: match by sender email across open tickets ───────────────
    if (!ticketId) {
      const senderEmail = extractEmail(from)
      console.log('No ticket ID in subject, searching by sender email:', senderEmail)

      if (senderEmail) {
        const { data: matchedTickets } = await supabase
          .from('tickets')
          .select('id, title, status')
          .eq('contact_email', senderEmail)
          .not('status', 'in', '("closed","resolved")')
          .order('created_at', { ascending: false })
          .limit(1)

        if (matchedTickets && matchedTickets.length > 0) {
          ticketId = matchedTickets[0].id
          console.log('Matched ticket by sender email:', ticketId)
        }
      }
    }

    // ── No ticket found — create a new one ────────────────────────────────
    if (!ticketId) {
      console.log('No matching ticket found — creating new ticket from email')

      const senderEmail = extractEmail(from)
      const senderName  = extractName(from)

      // Find the org (single-org setup)
      const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
      const orgId = orgs?.[0]?.id

      if (!orgId) {
        return new Response(JSON.stringify({ error: 'No organization found' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Try to find matching customer by email
      const { data: contacts } = await supabase
        .from('customers')
        .select('id, name')
        .or(`contact_email.eq.${senderEmail}`)
        .limit(1)

      const customer = contacts?.[0]

      const { data: newTicket, error: ticketErr } = await supabase
        .from('tickets')
        .insert({
          organization_id: orgId,
          title:           cleanSubject(subject),
          description:     body || '',
          priority:        'medium',
          category:        'other',
          status:          'open',
          contact_email:   senderEmail,
          contact_name:    senderName || senderEmail,
          customer_id:     customer?.id   || null,
          customer_name:   customer?.name || null,
          source:          'email',
        })
        .select()
        .single()

      if (ticketErr) {
        console.error('Failed to create ticket:', ticketErr.message)
        return new Response(JSON.stringify({ error: ticketErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('Created new ticket from email:', newTicket.id)

      return new Response(JSON.stringify({ ok: true, action: 'created_ticket', ticket_id: newTicket.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Ticket found — add reply as comment ───────────────────────────────
    const senderName  = extractName(from)
    const senderEmail = extractEmail(from)

    const { error: commentErr } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id:    ticketId,
        author_name:  senderName || senderEmail || 'Client',
        author_email: senderEmail || '',
        content:      body || '(no body)',
        is_staff:     false,
        source:       'email',
      })

    if (commentErr) {
      console.error('Failed to add comment:', commentErr.message)
      return new Response(JSON.stringify({ error: commentErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update ticket status to open if it was waiting
    const { data: ticket } = await supabase
      .from('tickets')
      .select('status, organization_id')
      .eq('id', ticketId)
      .single()

    if (ticket?.status === 'waiting') {
      await supabase.from('tickets').update({ status: 'open' }).eq('id', ticketId)
    }

    console.log('Added reply comment to ticket:', ticketId)

    return new Response(JSON.stringify({ ok: true, action: 'added_comment', ticket_id: ticketId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractEmail(from) {
  if (!from) return null
  // Match "Name <email@domain.com>" or just "email@domain.com"
  const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/)
  return match ? match[1].toLowerCase().trim() : null
}

function extractName(from) {
  if (!from) return null
  // Match "John Smith <email>" → return "John Smith"
  const match = from.match(/^"?([^"<]+)"?\s*</)
  return match ? match[1].trim() : null
}

function cleanSubject(subject) {
  // Remove Re:, Fwd:, and our ticket ID tags
  return subject
    .replace(/^(Re:|Fwd?:|AW:|WG:)\s*/gi, '')
    .replace(/\[#[a-f0-9-]+\]/gi, '')
    .trim() || 'Email inquiry'
}