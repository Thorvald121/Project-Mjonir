// @ts-nocheck
// Runs daily and updates health_score on all active customers.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let body = {}
    try { body = await req.json() } catch {}
    const specificId = body.customer_id || null

    const custQuery = supabase.from('customers').select('id,organization_id,name').eq('status', 'active')
    if (specificId) custQuery.eq('id', specificId)
    const { data: customers } = await custQuery
    if (!customers?.length) return ok('no customers')

    const now = new Date()
    let updated = 0

    for (const cust of customers) {
      const [
        { data: tickets },
        { data: invoices },
        { data: csat },
      ] = await Promise.all([
        supabase.from('tickets').select('id,status,priority,sla_due_date')
          .eq('customer_id', cust.id)
          .not('status', 'in', '("resolved","closed")'),
        supabase.from('invoices').select('id,status,due_date')
          .eq('customer_id', cust.id)
          .in('status', ['sent', 'overdue', 'partial']),
        supabase.from('csat_responses').select('score')
          .eq('customer_name', cust.name)
          .gte('submitted_at', new Date(now.getTime() - 90 * 86400000).toISOString())
          .limit(50),
      ])

      let score = 100
      const open     = tickets ?? []
      const invList  = invoices ?? []
      const csatList = csat ?? []

      const openCount = open.length
      if (openCount > 0) score -= Math.min(25, openCount * 5)

      const critical = open.filter(t => t.priority === 'critical').length
      if (critical > 0) score -= Math.min(30, critical * 15)

      const breached = open.filter(t =>
        t.sla_due_date && new Date(t.sla_due_date) < now
      ).length
      if (breached > 0) score -= Math.min(35, breached * 15)

      const overdue = invList.filter(i =>
        i.due_date && new Date(i.due_date) < now
      ).length
      if (overdue > 0) score -= Math.min(25, overdue * 12)

      if (csatList.length >= 2) {
        const avg = csatList.reduce((s, r) => s + (r.score || 0), 0) / csatList.length
        if (avg >= 4.5)      score += 10
        else if (avg >= 4.0) score += 5
        else if (avg < 3.0)  score -= 15
        else if (avg < 3.5)  score -= 8
      }

      score = Math.max(0, Math.min(100, Math.round(score)))

      await supabase.from('customers').update({
        health_score:      score,
        health_updated_at: now.toISOString(),
      }).eq('id', cust.id)

      updated++
    }

    return ok(`updated ${updated} customers`)
  } catch (err) {
    console.error(err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}