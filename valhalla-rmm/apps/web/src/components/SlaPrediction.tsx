// @ts-nocheck
// SLA Breach Prediction
// Uses a simple scoring model based on:
//   - Time elapsed as % of total SLA window
//   - Priority (higher = tighter expected response)
//   - Whether a first response has been sent
//   - Ticket age vs typical resolution time by priority
//
// Returns a risk level: 'critical' | 'high' | 'medium' | 'ok'
// This is intentionally kept client-side so it runs without extra DB queries.

export type SlaPrediction = {
  risk:       'critical' | 'high' | 'medium' | 'ok'
  score:      number   // 0–100
  reason:     string
  hoursLeft:  number | null
  pctElapsed: number | null
}

// Typical SLA windows by priority (hours) — used when sla_due_date is missing
const TYPICAL_SLA: Record<string, number> = {
  critical: 4,
  high:     8,
  medium:   24,
  low:      72,
}

// How long tickets of each priority typically take to resolve (hours)
// Used to predict whether a ticket is "running long"
const TYPICAL_RESOLUTION: Record<string, number> = {
  critical: 2,
  high:     6,
  medium:   18,
  low:      48,
}

export function predictSlaBreach(ticket: {
  id:                string
  status:            string
  priority:          string
  sla_due_date:      string | null
  created_at:        string
  first_response_at: string | null
  assigned_to:       string | null
}): SlaPrediction {
  const { status, priority, sla_due_date, created_at, first_response_at, assigned_to } = ticket

  // Already done — no risk
  if (['resolved', 'closed'].includes(status)) {
    return { risk: 'ok', score: 0, reason: 'Resolved', hoursLeft: null, pctElapsed: null }
  }

  const now        = Date.now()
  const created    = new Date(created_at).getTime()
  const ageHours   = (now - created) / 3600000

  let hoursLeft: number | null  = null
  let pctElapsed: number | null = null
  let score = 0
  const reasons: string[] = []

  // ── Factor 1: Time remaining on SLA window ──────────────────────────────
  if (sla_due_date) {
    const due = new Date(sla_due_date).getTime()
    hoursLeft  = (due - now) / 3600000
    const totalWindow = (due - created) / 3600000
    pctElapsed = totalWindow > 0 ? Math.min(100, ((ageHours / totalWindow) * 100)) : 100

    if (hoursLeft < 0) {
      score += 100
      reasons.push('SLA already breached')
    } else if (hoursLeft < 1) {
      score += 85
      reasons.push(`Only ${Math.round(hoursLeft * 60)}m left`)
    } else if (hoursLeft < 2) {
      score += 70
      reasons.push(`${Math.round(hoursLeft * 10) / 10}h left`)
    } else if (pctElapsed > 80) {
      score += 50
      reasons.push(`${Math.round(pctElapsed)}% of SLA window elapsed`)
    } else if (pctElapsed > 60) {
      score += 30
      reasons.push(`${Math.round(pctElapsed)}% of SLA window elapsed`)
    }
  } else {
    // No SLA date — use priority-based typical window
    const typical = TYPICAL_SLA[priority] ?? 24
    pctElapsed = Math.min(100, (ageHours / typical) * 100)
    hoursLeft  = Math.max(0, typical - ageHours)

    if (pctElapsed > 90) { score += 60; reasons.push('Past typical resolution time') }
    else if (pctElapsed > 70) { score += 35; reasons.push('Approaching typical resolution time') }
  }

  // ── Factor 2: No first response yet ────────────────────────────────────
  if (!first_response_at) {
    const responseThreshold: Record<string, number> = {
      critical: 0.5, high: 1, medium: 4, low: 8,
    }
    const threshold = responseThreshold[priority] ?? 4
    if (ageHours > threshold * 2) {
      score += 25
      reasons.push('No response sent yet')
    } else if (ageHours > threshold) {
      score += 15
      reasons.push('First response overdue')
    }
  }

  // ── Factor 3: Unassigned ────────────────────────────────────────────────
  if (!assigned_to) {
    score += 10
    reasons.push('Unassigned')
  }

  // ── Factor 4: Priority multiplier ──────────────────────────────────────
  const multiplier: Record<string, number> = {
    critical: 1.3, high: 1.15, medium: 1.0, low: 0.85,
  }
  score = Math.min(100, score * (multiplier[priority] ?? 1.0))

  // ── Map score to risk level ─────────────────────────────────────────────
  let risk: SlaPrediction['risk']
  if (score >= 70)      risk = 'critical'
  else if (score >= 45) risk = 'high'
  else if (score >= 20) risk = 'medium'
  else                  risk = 'ok'

  return {
    risk,
    score:      Math.round(score),
    reason:     reasons[0] ?? 'On track',
    hoursLeft,
    pctElapsed,
  }
}

// ── Badge component ──────────────────────────────────────────────────────────
export function SlaPredictionBadge({ ticket, compact = false }: {
  ticket: any
  compact?: boolean
}) {
  const pred = predictSlaBreach(ticket)
  if (pred.risk === 'ok') return null

  const cfg = {
    critical: { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',    label: 'Breach risk',  dot: 'bg-rose-500'   },
    high:     { cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400', label: 'At risk',      dot: 'bg-orange-500' },
    medium:   { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400', label: 'Watch',        dot: 'bg-amber-500'  },
    ok:       { cls: '', label: '', dot: '' },
  }[pred.risk]

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.cls}`}
        title={pred.reason}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
        {cfg.label}
      </span>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}
      title={`Score: ${pred.score}/100 — ${pred.reason}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${pred.risk === 'critical' ? 'animate-pulse' : ''}`} />
      {cfg.label}: {pred.reason}
    </div>
  )
}

// ── Dashboard widget ─────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'
import { AlertTriangle, TrendingUp } from 'lucide-react'

export function SlaPredictionWidget({ tickets }: { tickets: any[] }) {
  const router   = useRouter()
  const openTickets = tickets.filter(t => !['resolved','closed'].includes(t.status))

  const atRisk = openTickets
    .map(t => ({ ticket: t, pred: predictSlaBreach(t) }))
    .filter(({ pred }) => pred.risk !== 'ok')
    .sort((a, b) => b.pred.score - a.pred.score)
    .slice(0, 6)

  if (atRisk.length === 0) return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-emerald-500" /> SLA Prediction
      </h2>
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <span className="text-2xl">✓</span>
        <div>
          <p className="text-sm font-semibold">All tickets on track</p>
          <p className="text-xs text-slate-400 mt-0.5">{openTickets.length} open ticket{openTickets.length !== 1 ? 's' : ''} — no breach risk detected</p>
        </div>
      </div>
    </div>
  )

  const critical = atRisk.filter(x => x.pred.risk === 'critical').length
  const high     = atRisk.filter(x => x.pred.risk === 'high').length

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" /> SLA Breach Prediction
        </h2>
        <div className="flex items-center gap-2">
          {critical > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">{critical} critical</span>}
          {high > 0    && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">{high} high</span>}
        </div>
      </div>
      <div className="space-y-2">
        {atRisk.map(({ ticket: t, pred }) => {
          const riskCfg = {
            critical: 'border-l-rose-500',
            high:     'border-l-orange-500',
            medium:   'border-l-amber-400',
            ok:       'border-l-slate-200',
          }[pred.risk]
          return (
            <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
              className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 border-l-4 ${riskCfg} hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{t.title}</p>
                <p className="text-[11px] text-slate-400 truncate">{t.customer_name} · {pred.reason}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {pred.hoursLeft !== null && pred.hoursLeft > 0 && (
                  <p className={`text-xs font-bold ${pred.risk === 'critical' ? 'text-rose-600' : pred.risk === 'high' ? 'text-orange-600' : 'text-amber-600'}`}>
                    {pred.hoursLeft < 1
                      ? `${Math.round(pred.hoursLeft * 60)}m`
                      : `${Math.round(pred.hoursLeft * 10) / 10}h`} left
                  </p>
                )}
                {pred.hoursLeft !== null && pred.hoursLeft <= 0 && (
                  <p className="text-xs font-bold text-rose-600">Breached</p>
                )}
                {pred.pctElapsed !== null && (
                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mt-1 overflow-hidden">
                    <div className={`h-1.5 rounded-full transition-all ${
                      pred.risk === 'critical' ? 'bg-rose-500' :
                      pred.risk === 'high'     ? 'bg-orange-500' : 'bg-amber-400'
                    }`} style={{ width: `${Math.min(100, pred.pctElapsed)}%` }} />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {openTickets.length > 6 && (
        <button onClick={() => router.push('/tickets')}
          className="mt-2 text-xs text-slate-400 hover:text-amber-500 transition-colors w-full text-center">
          View all {openTickets.length} open tickets →
        </button>
      )}
    </div>
  )
}