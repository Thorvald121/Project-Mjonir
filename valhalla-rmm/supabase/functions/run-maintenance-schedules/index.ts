// @ts-nocheck
// Runs daily. Finds maintenance schedules where next_run_date <= today,
// creates a ticket for each, then advances next_run_date to the next period.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const today = new Date().toISOString().slice(0, 10)

    // Find all active schedules due today or overdue
    const { data: schedules, error } = await supabase
      .from('maintenance_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_date', today)

    if (error) throw error
    if (!schedules?.length) return ok('no schedules due')

    let created = 0

    for (const sch of schedules) {
      // Create the ticket
      const { error: ticketErr } = await supabase.from('tickets').insert({
        organization_id: sch.organization_id,
        title:           sch.title,
        description:     sch.description || `Scheduled maintenance: ${sch.title}`,
        priority:        sch.priority || 'medium',
        category:        sch.category || 'maintenance',
        status:          'open',
        customer_id:     sch.customer_id || null,
        customer_name:   sch.customer_name || null,
        assigned_to:     sch.assigned_to || null,
        source:          'scheduled',
      })

      if (ticketErr) {
        console.error(`Failed to create ticket for schedule ${sch.id}:`, ticketErr.message)
        continue
      }

      // Advance next_run_date
      const next = getNextDate(sch.next_run_date || today, sch.frequency)
      await supabase.from('maintenance_schedules').update({
        last_run_at:   new Date().toISOString(),
        next_run_date: next,
      }).eq('id', sch.id)

      created++
      console.log(`Created ticket for schedule: ${sch.title} → next run ${next}`)
    }

    return ok(`created ${created} tickets from ${schedules.length} due schedules`)
  } catch (err) {
    console.error(err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

function getNextDate(from, frequency) {
  const d = new Date(from)
  switch (frequency) {
    case 'daily':     d.setDate(d.getDate() + 1); break
    case 'weekly':    d.setDate(d.getDate() + 7); break
    case 'biweekly':  d.setDate(d.getDate() + 14); break
    case 'monthly':   d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'annually':  d.setFullYear(d.getFullYear() + 1); break
    default:          d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0, 10)
}

function ok(msg) {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}