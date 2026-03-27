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
    const payload = await req.json()
    const { from, to, subject: subjectDirect, body: bodyDirect, raw_email } = payload

    console.log('Received payload keys:', Object.keys(payload).join(', '))

    // Parse from raw email if provided, otherwise use direct fields
    let subject     = subjectDirect || ''
    let textBody    = bodyDirect    || ''
    let htmlBody    = ''
    let replyTo     = null
    let originalFrom = null

    if (raw_email) {
      console.log('Parsing raw email, length:', raw_email.length)
      const parsed = parseRawEmail(raw_email)
      subject      = parsed.subject      || subjectDirect || ''
      textBody     = parsed.textBody     || bodyDirect    || ''
      htmlBody     = parsed.htmlBody     || ''
      replyTo      = parsed.replyTo      || null
      originalFrom = parsed.originalFrom || null
      console.log('Parsed subject:', subject)
      console.log('Parsed replyTo:', replyTo)
      console.log('Parsed originalFrom:', originalFrom)
      console.log('Parsed textBody length:', textBody.length)
      console.log('Parsed textBody preview:', textBody.slice(0, 200))
    } else {
      console.log('No raw_email, using direct body:', textBody?.slice(0, 200))
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Prefer Reply-To > X-Original-From > From
    // This handles emails forwarded via Atlassian, SendGrid, Mailchimp etc.
    // where From becomes a bounce/envelope address
    const effectiveFrom = replyTo || originalFrom || from || ''
    const senderEmail   = extractEmail(effectiveFrom) || extractEmail(from || '')
    const senderName    = extractName(effectiveFrom)  || extractName(from || '')

    console.log('From:', from, '→ effective:', effectiveFrom, '→ email:', senderEmail, 'name:', senderName)
    console.log('To:', to)
    console.log('Subject:', subject)

    // ── Find ticket ID — 5 strategies ────────────────────────────────────
    let ticketId = null

    // 1. UUID in subject [#uuid]
    const subjectMatch = subject?.match(/\[#([a-f0-9-]{36})\]/i)
    if (subjectMatch) { ticketId = subjectMatch[1]; console.log('Strategy 1 (subject):', ticketId) }

    // 2. support+uuid@ in To address
    if (!ticketId) {
      const toMatch = to?.match(/support\+([a-f0-9-]{36})@/i)
      if (toMatch) { ticketId = toMatch[1]; console.log('Strategy 2 (to address):', ticketId) }
    }

    // 3. TICKET_ID: in HTML body
    if (!ticketId && htmlBody) {
      const m = htmlBody.match(/TICKET_ID:([a-f0-9-]{36})/i)
      if (m) { ticketId = m[1]; console.log('Strategy 3 (html body):', ticketId) }
    }

    // 4. TICKET_ID: in text body
    if (!ticketId && textBody) {
      const m = textBody.match(/TICKET_ID:([a-f0-9-]{36})/i)
      if (m) { ticketId = m[1]; console.log('Strategy 4 (text body):', ticketId) }
    }

    // 5. Match by sender email
    if (!ticketId && senderEmail) {
      console.log('Strategy 5: searching by sender email:', senderEmail)
      const { data: matched } = await supabase
        .from('tickets')
        .select('id,status')
        .eq('contact_email', senderEmail)
        .not('status', 'in', '("closed","resolved")')
        .order('created_at', { ascending: false })
        .limit(1)
      if (matched?.length > 0) { ticketId = matched[0].id; console.log('Strategy 5 matched:', ticketId) }
    }

    // ── No match — create new ticket ──────────────────────────────────────
    if (!ticketId) {
      console.log('No ticket found — creating new one')
      const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
      const orgId = orgs?.[0]?.id
      if (!orgId) return new Response(JSON.stringify({ error: 'No org found' }), { status: 500 })

      const { data: customers } = await supabase
        .from('customers').select('id,name').eq('contact_email', senderEmail).limit(1)
      const customer = customers?.[0]

      const { data: newTicket, error: ticketErr } = await supabase
        .from('tickets')
        .insert({
          organization_id: orgId,
          title:           cleanSubject(subject || 'Email inquiry'),
          description:     textBody || htmlBody || '',
          priority:        'medium',
          category:        'other',
          status:          'open',
          contact_email:   senderEmail,
          contact_name:    senderName || senderEmail,
          customer_id:     customer?.id   || null,
          customer_name:   customer?.name || null,
          source:          'email',
        })
        .select().single()

      if (ticketErr) return new Response(JSON.stringify({ error: ticketErr.message }), { status: 500 })
      console.log('Created new ticket:', newTicket.id)
      return new Response(JSON.stringify({ ok: true, action: 'created_ticket', ticket_id: newTicket.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Add as comment on existing ticket ─────────────────────────────────
    const rawBody   = textBody || htmlBody || ''
    const cleanBody = stripQuotedReply(rawBody).trim()
    const finalBody = cleanBody.length > 0 ? cleanBody : rawBody.trim()

    console.log('Final body to save:', JSON.stringify(finalBody.slice(0, 300)))

    if (!finalBody) {
      console.log('ERROR: No body content found after all processing')
      return new Response(JSON.stringify({ error: 'empty body' }), { status: 400 })
    }

    const { data: ticket } = await supabase
      .from('tickets').select('status,contact_email,organization_id').eq('id', ticketId).single()

    if (!ticket) return new Response(JSON.stringify({ error: 'Ticket not found' }), { status: 404 })

    const { error: commentErr } = await supabase
      .from('ticket_comments')
      .insert({
        ticket_id:       ticketId,
        organization_id: ticket.organization_id,
        author_name:     senderName || senderEmail || 'Client',
        author_email:    senderEmail || '',
        content:         finalBody,
        is_staff:        false,
        source:          'email',
      })

    if (commentErr) {
      console.error('Comment insert error:', commentErr.message)
      return new Response(JSON.stringify({ error: commentErr.message }), { status: 500 })
    }

    // Update ticket if needed
    const updates = {}
    if (!ticket.contact_email && senderEmail) updates.contact_email = senderEmail
    // Re-open if client replies to a resolved/closed/waiting ticket
    if (['waiting', 'resolved', 'closed'].includes(ticket.status)) updates.status = 'open'
    if (Object.keys(updates).length > 0) await supabase.from('tickets').update(updates).eq('id', ticketId)

    console.log('Added comment to ticket:', ticketId)
    return new Response(JSON.stringify({ ok: true, action: 'added_comment', ticket_id: ticketId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unhandled error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ── Email parsing ──────────────────────────────────────────────────────────────

function parseRawEmail(raw) {
  const nl      = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines   = raw.split(nl)
  const headers = {}
  let i = 0

  // Parse headers
  while (i < lines.length) {
    const line = lines[i]
    if (line === '' || line === '\r') { i++; break }
    // Folded header continuation
    if ((line.startsWith(' ') || line.startsWith('\t')) && i > 0) {
      const lastKey = Object.keys(headers).pop()
      if (lastKey) headers[lastKey] += ' ' + line.trim()
    } else {
      const colon = line.indexOf(':')
      if (colon > 0) {
        const key = line.slice(0, colon).toLowerCase().trim()
        const val = line.slice(colon + 1).trim()
        headers[key] = val
      }
    }
    i++
  }

  const subject    = decodeHeader(headers['subject']         || '')
  const replyTo    = headers['reply-to']                     || null
  const originalFrom = headers['x-original-from']
    || headers['x-forwarded-from']
    || headers['x-original-sender']
    || null

  const ct        = headers['content-type'] || ''
  const bodyLines = lines.slice(i)
  const bodyRaw   = bodyLines.join('\n')

  let textBody = ''
  let htmlBody = ''

  const boundary = extractBoundary(ct)

  if (boundary) {
    console.log('Multipart boundary:', boundary)
    const parts = bodyRaw.split(new RegExp('--' + escapeRegex(boundary) + '(?:--)?'))
    console.log('Parts found:', parts.length)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed || trimmed === '--') continue
      const { headers: ph, body: pb } = parsePart(trimmed)
      const partCt  = ph['content-type'] || ''
      const partEnc = ph['content-transfer-encoding'] || ''
      console.log('Part content-type:', partCt)
      if (partCt.includes('text/plain') && !textBody) {
        textBody = decodeBody(pb.trim(), partEnc)
        console.log('Found text/plain, length:', textBody.length)
      }
      if (partCt.includes('text/html') && !htmlBody) {
        htmlBody = decodeBody(pb.trim(), partEnc)
        console.log('Found text/html, length:', htmlBody.length)
      }
    }
  } else {
    // Single part
    const enc = headers['content-transfer-encoding'] || ''
    if (ct.includes('text/html')) {
      htmlBody = decodeBody(bodyRaw, enc)
    } else {
      textBody = decodeBody(bodyRaw, enc)
    }
    console.log('Single part, textBody length:', textBody.length, 'htmlBody length:', htmlBody.length)
  }

  return { subject, replyTo, originalFrom, textBody, htmlBody }
}

function extractBoundary(ct) {
  const m = ct.match(/boundary=["']?([^"';\s]+)["']?/i)
  return m ? m[1] : null
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parsePart(part) {
  const lines   = part.split('\n')
  const headers = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i].replace(/\r$/, '')
    if (line === '') { i++; break }
    const colon = line.indexOf(':')
    if (colon > 0) {
      headers[line.slice(0, colon).toLowerCase().trim()] = line.slice(colon + 1).trim()
    }
    i++
  }
  return { headers, body: lines.slice(i).join('\n') }
}

function decodeBody(body, encoding) {
  const enc = (encoding || '').toLowerCase().trim()
  if (enc === 'base64') {
    try { return atob(body.replace(/[\r\n\s]/g, '')) } catch (e) { console.error('base64 decode failed:', e.message); return body }
  }
  if (enc === 'quoted-printable') {
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  }
  return body
}

function decodeHeader(value) {
  if (!value) return ''
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, _cs, enc, encoded) => {
    try {
      if (enc.toUpperCase() === 'B') return atob(encoded)
      if (enc.toUpperCase() === 'Q') return encoded.replace(/_/g, ' ').replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    } catch {}
    return encoded
  })
}

function extractEmail(from) {
  if (!from) return null
  const m = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/)
  const email = m ? m[1].toLowerCase().trim() : null
  if (!email) return null
  // Reject obvious bounce/forwarding addresses
  const bounceDomains = ['atlassian-bounces', 'bounces.', 'bounce.', 'mailer-daemon', 'noreply', 'no-reply', 'amazonses.com', 'sendgrid.net']
  if (bounceDomains.some(b => email.includes(b))) return null
  // Reject addresses that look like bounce IDs (long hex strings before @)
  if (/^[a-f0-9]{16,}-[a-f0-9-]+-[0-9]+@/.test(email)) return null
  return email
}

function extractName(from) {
  if (!from) return null
  const m = from.match(/^"?([^"<]+)"?\s*</)
  return m ? m[1].trim() : null
}

function cleanSubject(subject) {
  return subject.replace(/^(Re:|Fwd?:|AW:|WG:)\s*/gi, '').replace(/\[#[a-f0-9-]+\]/gi, '').trim() || 'Email inquiry'
}

function stripQuotedReply(text) {
  if (!text || text.length < 5) return text
  const patterns = [
    /^On .{10,200}wrote:\s*$/m,
    /^-{3,}\s*Original Message\s*-{3,}/mi,
    /^From:\s+/m,
    /^Sent:\s+/m,
    /^_{3,}/m,
  ]
  let cutAt = text.length
  for (const p of patterns) {
    const m = text.search(p)
    if (m > 0 && m < cutAt) cutAt = m
  }
  const lines     = text.slice(0, cutAt).split('\n')
  const cleanLines = lines.filter(l => !l.trimStart().startsWith('>'))
  const result    = cleanLines.join('\n').trim()
  return result.length > 10 ? result : text.trim()
}