// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Valhalla IT — SLA Engine
// Business hours: Monday–Friday 8am–5pm Eastern Time
// Critical: 1 hour, 24/7  |  High: 4 biz hrs  |  Medium: 8 biz hrs  |  Low: 16 biz hrs
// ─────────────────────────────────────────────────────────────────────────────

const TZ        = 'America/New_York'
const BIZ_START = 8   // 8am
const BIZ_END   = 17  // 5pm

function getETParts(date) {
  const DAYS = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    hour:    'numeric',
    minute:  'numeric',
    hour12:  false,
  }).formatToParts(date)
  const val = (t) => parts.find(p => p.type === t)?.value ?? '0'
  return {
    weekday: DAYS[val('weekday')] ?? 0,
    hour:    parseInt(val('hour'))   % 24,
    minute:  parseInt(val('minute')),
  }
}

function isBizTime(date) {
  const { weekday, hour } = getETParts(date)
  return weekday >= 1 && weekday <= 5 && hour >= BIZ_START && hour < BIZ_END
}

// Jump forward to the next moment that falls inside business hours
function skipToNextBizStart(date) {
  let d = new Date(date)
  for (let guard = 0; guard < 20; guard++) {
    const { weekday, hour } = getETParts(d)
    if (weekday >= 1 && weekday <= 5 && hour >= BIZ_START && hour < BIZ_END) return d
    // Before hours on a weekday → jump to 8am today
    if (weekday >= 1 && weekday <= 5 && hour < BIZ_START) {
      d = new Date(d.getTime() + (BIZ_START - hour) * 3_600_000)
    } else {
      // After hours or weekend → advance 1 hour and re-check
      d = new Date(d.getTime() + 3_600_000)
    }
  }
  return d
}

// Add N business hours to a start date, pausing outside business hours
function addBusinessHours(from, hours) {
  let d = skipToNextBizStart(from)
  let remaining = hours * 60 // in minutes

  while (remaining > 0) {
    const { hour, minute } = getETParts(d)
    // Minutes left in the current business window
    const minsLeftToday = (BIZ_END - hour - 1) * 60 + (60 - minute)

    if (remaining <= minsLeftToday) {
      return new Date(d.getTime() + remaining * 60_000)
    }
    // Consume the rest of today then jump to the next business start
    remaining -= minsLeftToday
    d = skipToNextBizStart(new Date(d.getTime() + (minsLeftToday + 60) * 60_000))
  }

  return d
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SLA_TARGETS = {
  critical: { label: '1 hour (24/7)',    hours: 1,  bizHours: false },
  high:     { label: '4 business hours', hours: 4,  bizHours: true  },
  medium:   { label: '8 business hours', hours: 8,  bizHours: true  },
  low:      { label: '2 business days',  hours: 16, bizHours: true  },
}

/**
 * Calculate when an SLA expires given a priority and a start time.
 * @param priority  'critical' | 'high' | 'medium' | 'low'
 * @param from      Start time (defaults to now)
 */
export function calculateSlaDue(priority, from = new Date()) {
  const target = SLA_TARGETS[priority]
  if (!target) return addBusinessHours(from, 8) // fall back to medium
  if (!target.bizHours) return new Date(from.getTime() + target.hours * 3_600_000)
  return addBusinessHours(from, target.hours)
}

/**
 * Returns a display state and human-readable label for an SLA due date.
 * state: 'done' (resolved/closed), 'ok', 'warning' (<2h left), 'breached'
 */
export function getSlaInfo(slaDue, status) {
  if (!slaDue || ['resolved', 'closed'].includes(status)) {
    return { state: 'done', label: null }
  }
  const diff = new Date(slaDue).getTime() - Date.now()
  if (diff < 0) {
    const h = Math.abs(Math.floor(diff / 3_600_000))
    const m = Math.abs(Math.floor((diff % 3_600_000) / 60_000))
    return { state: 'breached', label: `Breached ${h > 0 ? `${h}h ` : ''}${m}m ago` }
  }
  if (diff < 2 * 3_600_000) {
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    return { state: 'warning', label: h > 0 ? `${h}h ${m}m left` : `${m}m left` }
  }
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return { state: 'ok', label: h > 0 ? `${h}h ${m}m left` : `${m}m left` }
}