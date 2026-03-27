// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Star, TrendingUp, TrendingDown, Users, MessageSquare, Award, Filter, RefreshCw } from 'lucide-react'

const STAR_BG  = { 5:'bg-emerald-500',4:'bg-emerald-400',3:'bg-yellow-400',2:'bg-orange-400',1:'bg-rose-500' }
const STAR_CLR = { 5:'text-emerald-600',4:'text-emerald-500',3:'text-yellow-600',2:'text-orange-500',1:'text-rose-600' }
const STAR_LBL = { 5:'Excellent',4:'Good',3:'Neutral',2:'Poor',1:'Very Poor' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' })
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s,r) => s+(r.score||0),0) / arr.length
}

function StarRow({ score, count, maxCount }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-3 text-right">{score}</span>
      <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
        <div className={`${STAR_BG[score]} h-2.5 rounded-full transition-all`}
          style={{ width: maxCount ? `${(count/maxCount)*100}%` : '0%' }} />
      </div>
      <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function CsatPage() {
  const supabase = createSupabaseBrowserClient()
  const [responses, setResponses] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [range,     setRange]     = useState('90') // days
  const [customerFilter, setCustomerFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - parseInt(range))
    const { data } = await supabase
      .from('csat_responses')
      .select('*')
      .gte('submitted_at', since.toISOString())
      .order('submitted_at', { ascending: false })
      .limit(1000)
    setResponses(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [range])

  const customers = useMemo(() =>
    [...new Set(responses.map(r => r.customer_name).filter(Boolean))].sort()
  , [responses])

  const filtered = useMemo(() =>
    customerFilter === 'all' ? responses : responses.filter(r => r.customer_name === customerFilter)
  , [responses, customerFilter])

  const score      = avg(filtered)
  const rounded    = Math.round(score * 10) / 10
  const dist       = [5,4,3,2,1].map(n => ({ score:n, count: filtered.filter(r => r.score===n).length }))
  const maxCount   = Math.max(...dist.map(d => d.count), 1)
  const promoters  = filtered.filter(r => r.score >= 4).length
  const detractors = filtered.filter(r => r.score <= 2).length
  const nps        = filtered.length ? Math.round(((promoters - detractors) / filtered.length) * 100) : 0
  const withComment = filtered.filter(r => r.comment?.trim())

  // Trend — split into two halves
  const half   = Math.floor(filtered.length / 2)
  const recent = filtered.slice(0, half)
  const older  = filtered.slice(half)
  const trend  = older.length ? avg(recent) - avg(older) : 0

  // Per-customer breakdown
  const byCustomer = useMemo(() => {
    const map: Record<string,any[]> = {}
    filtered.forEach(r => {
      const k = r.customer_name || 'Unknown'
      if (!map[k]) map[k] = []
      map[k].push(r)
    })
    return Object.entries(map)
      .map(([name, rows]) => ({ name, count: rows.length, avg: avg(rows), rows }))
      .sort((a,b) => b.count - a.count)
  }, [filtered])

  // Monthly trend
  const byMonth = useMemo(() => {
    const map: Record<string,number[]> = {}
    filtered.forEach(r => {
      const m = new Date(r.submitted_at).toLocaleDateString('en-US',{ month:'short', year:'2-digit' })
      if (!map[m]) map[m] = []
      map[m].push(r.score)
    })
    return Object.entries(map)
      .map(([month, scores]) => ({ month, avg: avg(scores.map(s=>({score:s}))), count: scores.length }))
      .reverse()
  }, [filtered])

  const sel = "px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" /> CSAT Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Customer satisfaction scores and trends.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={range} onChange={e => setRange(e.target.value)} className={sel}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last year</option>
          </select>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className={sel}>
            <option value="all">All customers</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
          <Star className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No CSAT responses yet</p>
          <p className="text-slate-400 text-sm mt-1">Responses appear after tickets are resolved and surveys are sent.</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Avg Score" icon={Star}
              value={`${rounded}/5`}
              sub={`${filtered.length} response${filtered.length!==1?'s':''}`}
              color="bg-amber-500" />
            <StatCard label="NPS Score" icon={TrendingUp}
              value={nps > 0 ? `+${nps}` : nps}
              sub={`${promoters} promoters · ${detractors} detractors`}
              color={nps >= 30 ? 'bg-emerald-500' : nps >= 0 ? 'bg-amber-500' : 'bg-rose-500'} />
            <StatCard label="Trend" icon={trend >= 0 ? TrendingUp : TrendingDown}
              value={trend === 0 ? '—' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}`}
              sub="vs previous period"
              color={trend >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} />
            <StatCard label="With Comments" icon={MessageSquare}
              value={withComment.length}
              sub={`${Math.round((withComment.length/filtered.length)*100)}% left feedback`}
              color="bg-violet-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Score distribution */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">Score Distribution</h2>
              <div className="flex items-start gap-5 mb-5">
                <div className="text-center">
                  <p className="text-4xl font-bold text-slate-900 dark:text-white">{rounded}</p>
                  <div className="flex gap-0.5 justify-center mt-1">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`w-4 h-4 ${n<=Math.round(score)?'fill-amber-400 text-amber-400':'text-slate-200 dark:text-slate-700'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{filtered.length} total</p>
                </div>
                <div className="flex-1 space-y-2">
                  {dist.map(({ score, count }) => (
                    <StarRow key={score} score={score} count={count} maxCount={maxCount} />
                  ))}
                </div>
              </div>
            </div>

            {/* Monthly trend */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">Monthly Trend</h2>
              {byMonth.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">Not enough data</p>
              ) : (
                <div className="space-y-2">
                  {byMonth.slice(-6).map(({ month, avg: a, count }) => (
                    <div key={month} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-14 flex-shrink-0">{month}</span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-400 h-2 rounded-full transition-all"
                          style={{ width: `${(a/5)*100}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-8 text-right">{Math.round(a*10)/10}</span>
                      <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top customers */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">By Customer</h2>
              {byCustomer.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">No data</p>
              ) : (
                <div className="space-y-2.5">
                  {byCustomer.slice(0,6).map(({ name, count, avg: a }) => (
                    <div key={name} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{name}</p>
                        <p className="text-xs text-slate-400">{count} response{count!==1?'s':''}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className={`text-xs font-bold ${STAR_CLR[Math.round(a)] ?? 'text-slate-500'}`}>
                          {Math.round(a*10)/10}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent comments */}
          {withComment.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-violet-500" /> Customer Comments
                <span className="text-xs font-normal text-slate-400">({withComment.length})</span>
              </h2>
              <div className="space-y-3">
                {withComment.slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${STAR_BG[r.score]}`}>
                      {r.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {r.customer_name || r.contact_email || 'Anonymous'}
                        </p>
                        <p className="text-xs text-slate-400 flex-shrink-0">{fmtDate(r.submitted_at)}</p>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 break-words">{r.comment}</p>
                      {r.ticket_title && (
                        <p className="text-xs text-slate-400 mt-1">Re: {r.ticket_title}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full response table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">All Responses</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.slice(0,50).map(r => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`w-3 h-3 ${n<=r.score?'fill-amber-400 text-amber-400':'text-slate-200 dark:text-slate-700'}`} />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{r.customer_name || r.contact_email || '—'}</p>
                    {r.ticket_title && <p className="text-xs text-slate-400 truncate">{r.ticket_title}</p>}
                    {r.comment && <p className="text-xs text-slate-500 mt-0.5 break-words">{r.comment}</p>}
                  </div>
                  <p className="text-xs text-slate-400 flex-shrink-0">{fmtDate(r.submitted_at)}</p>
                </div>
              ))}
              {filtered.length > 50 && (
                <div className="px-5 py-3 text-center">
                  <p className="text-xs text-slate-400">Showing 50 of {filtered.length} responses</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}