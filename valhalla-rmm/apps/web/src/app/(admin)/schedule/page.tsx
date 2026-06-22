// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import ScheduleJobModal from '@/components/schedule/ScheduleJobModal'
import {
  ChevronLeft, ChevronRight, Plus, Calendar, LayoutGrid,
  MapPin, Monitor, Phone, Users, Clock, RefreshCw,
} from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks,
         isSameDay, parseISO, isToday } from 'date-fns'

// ─── Constants ──────────────────────────────────────────────────────────────
const DAY_START_HOUR = 7   // 7am
const DAY_END_HOUR   = 19  // 7pm
const HOUR_HEIGHT_PX = 64  // height per hour row in px
const TOTAL_HOURS    = DAY_END_HOUR - DAY_START_HOUR

const STATUS_COLORS = {
  scheduled: { bg: 'bg-blue-500/20',   border: 'border-blue-500/50',   text: 'text-blue-300',   dot: 'bg-blue-500'   },
  en_route:  { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-300', dot: 'bg-yellow-500' },
  on_site:   { bg: 'bg-amber-500/20',  border: 'border-amber-500/50',  text: 'text-amber-300',  dot: 'bg-amber-500'  },
  completed: { bg: 'bg-green-500/20',  border: 'border-green-500/50',  text: 'text-green-300',  dot: 'bg-green-500'  },
  cancelled: { bg: 'bg-slate-700/40',  border: 'border-slate-600/50',  text: 'text-slate-500',  dot: 'bg-slate-500'  },
}

const JOB_TYPE_ICONS = {
  on_site:  MapPin,
  remote:   Monitor,
  phone:    Phone,
  meeting:  Users,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function useRealtimeRefresh(tables, onRefresh) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh
  useEffect(() => {
    const h = (e) => {
      if (!tables.length || tables.includes(e.detail?.table)) ref.current()
    }
    window.addEventListener('supabase:change', h)
    return () => window.removeEventListener('supabase:change', h)
  }, [tables.join(',')])
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

function jobsForDay(jobs, day) {
  return jobs.filter(j => isSameDay(parseISO(j.scheduled_start), day))
}

function calcPosition(job) {
  const start    = parseISO(job.scheduled_start)
  const end      = parseISO(job.scheduled_end)
  const startMin = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes()
  const endMin   = (end.getHours()   - DAY_START_HOUR) * 60 + end.getMinutes()
  const top      = Math.max(0, (startMin / 60) * HOUR_HEIGHT_PX)
  const height   = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2)
  return { top, height }
}

function formatTime(iso) {
  const d = parseISO(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12  = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

// ─── JobBlock ─────────────────────────────────────────────────────────────────
function JobBlock({ job, onClick, compact = false }) {
  const colors  = STATUS_COLORS[job.status] || STATUS_COLORS.scheduled
  const Icon    = JOB_TYPE_ICONS[job.job_type] || MapPin
  const { top, height } = calcPosition(job)

  return (
    <button
      onClick={() => onClick(job)}
      style={{ top, height, position: 'absolute', left: 2, right: 2 }}
      className={`rounded-md border px-1.5 py-1 text-left overflow-hidden group transition-all hover:brightness-110 z-10 ${colors.bg} ${colors.border}`}
    >
      <div className={`flex items-start gap-1 ${colors.text}`}>
        <Icon className="w-3 h-3 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold leading-tight truncate">{job.title}</div>
          {height > 38 && (
            <div className="text-[10px] opacity-70 leading-tight truncate mt-0.5">
              {job.customer_name || job.assigned_name}
            </div>
          )}
          {height > 56 && (
            <div className="text-[10px] opacity-60 leading-tight mt-0.5">
              {formatTime(job.scheduled_start)} – {formatTime(job.scheduled_end)}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── CalendarView ─────────────────────────────────────────────────────────────
function CalendarView({ jobs, weekDays, onJobClick, onSlotClick }) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i)
  const nowRef = useRef(null)

  // Scroll to current time on mount
  useEffect(() => {
    nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const nowMinutes = (() => {
    const now = new Date()
    return (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes()
  })()
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT_PX

  return (
    <div className="flex-1 overflow-auto">
      {/* Day headers */}
      <div className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
          <div className="h-12" />
          {weekDays.map(day => (
            <div key={day.toISOString()} className="h-12 flex flex-col items-center justify-center border-l border-slate-800">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                {format(day, 'EEE')}
              </span>
              <span className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${
                isToday(day) ? 'bg-amber-500 text-black' : 'text-slate-200'
              }`}>
                {format(day, 'd')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Time grid */}
      <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>

        {/* Hour labels */}
        <div>
          {hours.map(h => (
            <div
              key={h}
              style={{ height: HOUR_HEIGHT_PX }}
              className="flex items-start justify-end pr-3 pt-1"
            >
              <span className="text-[11px] text-slate-600 font-medium">
                {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map(day => {
          const dayJobs = jobsForDay(jobs, day)
          const todayLine = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className="relative border-l border-slate-800/60"
              style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX }}
            >
              {/* Hour cells (clickable) */}
              {hours.map(h => (
                <div
                  key={h}
                  style={{ height: HOUR_HEIGHT_PX }}
                  className="border-t border-slate-800/40 hover:bg-slate-800/20 cursor-pointer transition-colors group"
                  onClick={() => {
                    const d = new Date(day)
                    d.setHours(h, 0, 0, 0)
                    onSlotClick(d.toISOString())
                  }}
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-1">
                    <Plus className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                </div>
              ))}

              {/* Current time indicator */}
              {todayLine && nowMinutes >= 0 && nowMinutes < TOTAL_HOURS * 60 && (
                <div
                  ref={nowRef}
                  style={{ top: nowTop, position: 'absolute', left: 0, right: 0, zIndex: 15 }}
                  className="pointer-events-none"
                >
                  <div className="h-px bg-rose-500 relative">
                    <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-rose-500" />
                  </div>
                </div>
              )}

              {/* Job blocks */}
              {dayJobs.map(job => (
                <JobBlock key={job.id} job={job} onClick={onJobClick} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── DispatchBoard ────────────────────────────────────────────────────────────
function DispatchBoard({ jobs, weekDays, selectedDay, onJobClick, onSlotClick }) {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => DAY_START_HOUR + i)

  // Derive unique technicians from jobs + sort
  const techs = Array.from(
    new Map(
      jobs
        .filter(j => j.assigned_to)
        .map(j => [j.assigned_to, { email: j.assigned_to, name: j.assigned_name || j.assigned_to }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  if (techs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
        No jobs scheduled for this week yet.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Tech headers */}
      <div className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${techs.length}, minmax(160px, 1fr))` }}>
          <div className="h-12" />
          {techs.map(tech => (
            <div key={tech.email} className="h-12 flex items-center justify-center border-l border-slate-800 px-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <span className="text-amber-400 font-bold text-xs">
                    {(tech.name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-300 truncate">{tech.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(${techs.length}, minmax(160px, 1fr))` }}>

        {/* Hour labels */}
        <div>
          {hours.map(h => (
            <div
              key={h}
              style={{ height: HOUR_HEIGHT_PX }}
              className="flex items-start justify-end pr-3 pt-1"
            >
              <span className="text-[11px] text-slate-600 font-medium">
                {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
              </span>
            </div>
          ))}
        </div>

        {/* Tech columns */}
        {techs.map(tech => {
          const techJobs = jobs.filter(
            j => j.assigned_to === tech.email && isSameDay(parseISO(j.scheduled_start), selectedDay)
          )
          return (
            <div
              key={tech.email}
              className="relative border-l border-slate-800/60"
              style={{ height: TOTAL_HOURS * HOUR_HEIGHT_PX }}
            >
              {hours.map(h => (
                <div
                  key={h}
                  style={{ height: HOUR_HEIGHT_PX }}
                  className="border-t border-slate-800/40 hover:bg-slate-800/20 cursor-pointer transition-colors"
                  onClick={() => {
                    const d = new Date(selectedDay)
                    d.setHours(h, 0, 0, 0)
                    onSlotClick(d.toISOString(), tech)
                  }}
                />
              ))}
              {techJobs.map(job => (
                <JobBlock key={job.id} job={job} onClick={onJobClick} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── JobListSidebar ────────────────────────────────────────────────────────────
function JobListSidebar({ jobs, onJobClick }) {
  const today     = new Date()
  const tomorrow  = addDays(today, 1)
  const upcoming  = jobs
    .filter(j => j.status !== 'cancelled' && j.status !== 'completed')
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))
    .slice(0, 20)

  if (upcoming.length === 0) {
    return (
      <div className="w-64 shrink-0 border-l border-slate-800 p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Upcoming</h3>
        <p className="text-sm text-slate-600">No upcoming jobs this week.</p>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 border-l border-slate-800 overflow-y-auto">
      <div className="p-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Upcoming</h3>
        <div className="space-y-2">
          {upcoming.map(job => {
            const colors = STATUS_COLORS[job.status] || STATUS_COLORS.scheduled
            const Icon   = JOB_TYPE_ICONS[job.job_type] || MapPin
            const start  = parseISO(job.scheduled_start)
            const label  = isToday(start) ? 'Today'
              : isSameDay(start, tomorrow) ? 'Tomorrow'
              : format(start, 'MMM d')
            return (
              <button
                key={job.id}
                onClick={() => onJobClick(job)}
                className="w-full text-left p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition-all group"
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{job.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{job.customer_name}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                      <span className="text-[10px] text-slate-600">·</span>
                      <span className="text-[10px] text-slate-500">{formatTime(job.scheduled_start)}</span>
                      <Icon className={`w-3 h-3 ml-auto ${colors.text} opacity-70`} />
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const supabase = createSupabaseBrowserClient()

  const [jobs, setJobs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState('calendar')  // 'calendar' | 'dispatch'
  const [weekStart, setWeekStart]   = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday start
  )
  const [selectedDay, setSelectedDay] = useState(new Date())

  // Modal state
  const [modalOpen, setModalOpen]       = useState(false)
  const [editJob, setEditJob]           = useState(null)
  const [initialDate, setInitialDate]   = useState(null)

  const weekDays = getWeekDays(weekStart)

  // ── Load jobs ───────────────────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: mem } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .single()
    if (!mem) return

    const weekEnd = addDays(weekStart, 7)
    const { data, error } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('organization_id', mem.organization_id)
      .gte('scheduled_start', weekStart.toISOString())
      .lt('scheduled_start', weekEnd.toISOString())
      .order('scheduled_start', { ascending: true })

    if (!error) setJobs(data || [])
    setLoading(false)
  }, [weekStart])

  useEffect(() => { loadJobs() }, [loadJobs])
  useRealtimeRefresh(['scheduled_jobs'], loadJobs)

  // ── Handlers ────────────────────────────────────────────────────────────
  const openCreate = (isoDate = null) => {
    setEditJob(null)
    setInitialDate(isoDate)
    setModalOpen(true)
  }

  const openEdit = (job) => {
    setEditJob(job)
    setInitialDate(null)
    setModalOpen(true)
  }

  const prevWeek = () => setWeekStart(prev => subWeeks(prev, 1))
  const nextWeek = () => setWeekStart(prev => addWeeks(prev, 1))
  const goToday  = () => {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setSelectedDay(new Date())
  }

  const weekLabel = (() => {
    const end = addDays(weekStart, 6)
    if (weekStart.getMonth() === end.getMonth()) {
      return `${format(weekStart, 'MMM d')} – ${format(end, 'd, yyyy')}`
    }
    return `${format(weekStart, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  })()

  // Summary counts
  const todayJobs = jobs.filter(j => isToday(parseISO(j.scheduled_start)))
  const scheduled = jobs.filter(j => j.status === 'scheduled').length
  const onSite    = jobs.filter(j => j.status === 'on_site' || j.status === 'en_route').length
  const completed = jobs.filter(j => j.status === 'completed').length

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-slate-400 mt-0.5">{weekLabel}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary pills */}
          <div className="hidden md:flex items-center gap-2">
            {onSite > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {onSite} active
              </span>
            )}
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium">
              {scheduled} scheduled
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-300 text-xs font-medium">
              {completed} done
            </span>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === 'calendar'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setView('dispatch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === 'dispatch'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Dispatch
            </button>
          </div>

          {/* Week nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevWeek}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium hover:border-slate-600 hover:bg-slate-800 transition-all"
            >
              Today
            </button>
            <button
              onClick={nextWeek}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={loadJobs}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* New job */}
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Schedule Job
          </button>
        </div>
      </div>

      {/* ── Dispatch day selector (dispatch view only) ───────────────────── */}
      {view === 'dispatch' && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-800 shrink-0 overflow-x-auto">
          {weekDays.map(day => (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(day)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isSameDay(day, selectedDay)
                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  : isToday(day)
                  ? 'bg-slate-800 border border-slate-600 text-white'
                  : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="text-xs opacity-70">{format(day, 'EEE')}</span>
              <span>{format(day, 'd')}</span>
              {jobsForDay(jobs, day).filter(j => j.status !== 'cancelled').length > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center justify-center">
                  {jobsForDay(jobs, day).filter(j => j.status !== 'cancelled').length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading schedule…</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {view === 'calendar' ? (
            <CalendarView
              jobs={jobs}
              weekDays={weekDays}
              onJobClick={openEdit}
              onSlotClick={openCreate}
            />
          ) : (
            <DispatchBoard
              jobs={jobs}
              weekDays={weekDays}
              selectedDay={selectedDay}
              onJobClick={openEdit}
              onSlotClick={(iso, tech) => {
                setInitialDate(iso)
                setEditJob(null)
                setModalOpen(true)
              }}
            />
          )}

          {/* Sidebar — upcoming jobs */}
          <JobListSidebar jobs={jobs} onJobClick={openEdit} />
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      <ScheduleJobModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditJob(null); setInitialDate(null) }}
        onSaved={loadJobs}
        editJob={editJob}
        initialDate={initialDate}
      />
    </div>
  )
}