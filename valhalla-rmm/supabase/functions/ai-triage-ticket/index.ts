// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { ticket_id, title, description, organization_id } = await req.json()
    if (!ticket_id || !title) return json({ error: 'ticket_id and title required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Fetch KB articles for this org to suggest relevant ones
    const { data: kbArticles } = await supabase
      .from('knowledge_articles')
      .select('id, title, content, category')
      .eq('is_published', true)
      .limit(30)

    const kbList = (kbArticles || [])
      .map(a => `ID: ${a.id} | Title: ${a.title} | Category: ${a.category}`)
      .join('\n')

    const prompt = `You are a helpdesk triage assistant for an MSP (managed service provider).

Analyze this support ticket and respond with ONLY a JSON object, no other text.

Ticket Title: ${title}
Ticket Description: ${description || '(no description provided)'}

${kbList ? `Available Knowledge Base Articles:\n${kbList}\n` : ''}

Respond with exactly this JSON structure:
{
  "priority": "critical|high|medium|low",
  "category": "hardware|software|network|security|account|email|printing|other",
  "confidence": <integer 0-100>,
  "reasoning": "<one sentence explaining your classification>",
  "suggested_kb_ids": [<up to 3 KB article IDs that are relevant, or empty array>]
}

Rules:
- critical: system down, data loss, security breach affecting business operations
- high: major functionality broken, multiple users affected
- medium: single user issue, workaround exists
- low: cosmetic issue, question, minor inconvenience
- Only include KB article IDs if they are genuinely relevant to this ticket
- Keep reasoning to one concise sentence`

    // Get org AI provider preference (defaults to claude)
    const { data: org } = await supabase.from('organizations')
      .select('ai_provider').eq('id', organization_id).single()
    const provider = org?.ai_provider || 'claude'

    let triage
    if (provider === 'openai') {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      'gpt-4o-mini',
          max_tokens: 512,
          messages:   [{ role: 'user', content: prompt }],
        }),
      })
      if (!openaiRes.ok) {
        const err = await openaiRes.text()
        console.error('OpenAI error:', err)
        return json({ error: 'AI service unavailable' }, 500)
      }
      const openaiData = await openaiRes.json()
      const rawText = openaiData.choices?.[0]?.message?.content || ''
      try {
        triage = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      } catch {
        console.error('Failed to parse OpenAI response:', rawText)
        return json({ error: 'Failed to parse AI response' }, 500)
      }
    } else {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY'),
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages:   [{ role: 'user', content: prompt }],
        }),
      })
      if (!anthropicRes.ok) {
        const err = await anthropicRes.text()
        console.error('Anthropic error:', err)
        return json({ error: 'AI service unavailable' }, 500)
      }
      const anthropicData = await anthropicRes.json()
      const rawText = anthropicData.content?.[0]?.text || ''
      try {
        triage = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      } catch {
        console.error('Failed to parse Claude response:', rawText)
        return json({ error: 'Failed to parse AI response' }, 500)
      }
    }

    // Validate fields
    const validPriorities = ['critical','high','medium','low']
    const validCategories = ['hardware','software','network','security','account','email','printing','other']
    if (!validPriorities.includes(triage.priority)) triage.priority = 'medium'
    if (!validCategories.includes(triage.category)) triage.category = 'other'
    triage.confidence     = Math.min(100, Math.max(0, Number(triage.confidence) || 70))
    triage.suggested_kb_ids = (triage.suggested_kb_ids || []).slice(0, 3)

    // Save triage result to ticket
    await supabase.from('tickets').update({
      ai_triage: JSON.stringify(triage),
      priority:  triage.priority,
      category:  triage.category,
    }).eq('id', ticket_id)

    console.log(`Triaged ticket ${ticket_id}: ${triage.priority}/${triage.category} (${triage.confidence}%)`)
    return json({ triage })

  } catch (err) {
    console.error('Error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  })
}