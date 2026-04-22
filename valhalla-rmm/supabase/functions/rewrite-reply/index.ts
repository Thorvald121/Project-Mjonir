// @ts-nocheck
// supabase/functions/rewrite-reply/index.ts
// Takes a draft ticket reply and returns 4 tone variants via Claude

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { text } = await req.json()
    if (!text?.trim()) return json({ error: 'text is required' }, 400)

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-6',
        max_tokens: 1200,
        messages: [{
          role:    'user',
          content: `You are helping Kaleb Holder at Valhalla IT rewrite a support ticket reply in 4 different tones. Keep each rewrite focused, concise, and appropriate for IT support communication. Do not add information that wasn't in the original. Do not include a subject line. Return ONLY a raw JSON array — no markdown, no backticks, no explanation.

Format:
[
  {"tone": "Professional", "text": "..."},
  {"tone": "Formal", "text": "..."},
  {"tone": "Direct", "text": "..."},
  {"tone": "Friendly", "text": "..."}
]

Original reply to rewrite:
${text.trim()}`,
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Anthropic error:', err)
      return json({ error: 'AI request failed' }, 500)
    }

    const data = await res.json()
    const raw  = data.content?.[0]?.text || '[]'
    const clean = raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim()

    let suggestions
    try {
      suggestions = JSON.parse(clean)
    } catch {
      console.error('JSON parse error. Raw:', raw)
      return json({ error: 'Failed to parse AI response' }, 500)
    }

    return json({ suggestions })

  } catch (err) {
    console.error('Error:', err.message)
    return json({ error: err.message }, 500)
  }
})

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}