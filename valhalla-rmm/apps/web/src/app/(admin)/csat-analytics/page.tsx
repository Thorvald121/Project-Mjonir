// @ts-nocheck
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Star, TrendingUp, TrendingDown, MessageSquare,
  RefreshCw, Award, Copy, CheckCircle2, Eye, EyeOff,
} from 'lucide-react'

const STAR_BG  = { 5:'bg-emerald-500', 4:'bg-emerald-400', 3:'bg-yellow-400', 2:'bg-orange-400', 1:'bg-rose-500' }
const STAR_CLR = { 5:'text-emerald-600', 4:'text-emerald-500', 3:'text-yellow-600', 2:'text-orange-500', 1:'text-rose-600' }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, r) => s + (r.score || 0), 0) / arr.length
}

function StarRow({ score, count, maxCount }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-3 text-right">{score}</span>
      <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
        <div className={`${STAR_BG[score]} h-2.5 rounded-full transition-all`}
          style={{ width: maxCount ? `${(count / maxCount) * 100}%` : '0%' }} />
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

// The embed code snippet shown to the user for Squarespace
const EMBED_CODE = `<!-- Valhalla IT Reviews Widget -->
<div id="vit-reviews"></div>
<script>
(function(){
  var ENDPOINT = 'https://yetrdrgagfovphrerpie.supabase.co/functions/v1/get-featured-reviews';
  var GOOGLE_URL = 'https://www.google.com/search?q=Valhalla+IT&stick=H4sIAAAAAAAA_-NgU1I2qEg2TjVPSbRIMUpOSzJOSbMyqLAwMjI3S0kySTNINjNMSV3Eyh2WmJORmJOTqOAZAgAFhR-yNQAAAA#';
  var root = document.getElementById('vit-reviews');
  if (!root) return;
  root.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Loading reviews…</p>';
  fetch(ENDPOINT)
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok || !d.reviews || !d.reviews.length) {
        root.innerHTML = '';
        return;
      }
      var avg = (d.reviews.reduce(function(s,r){return s+r.score;},0)/d.reviews.length).toFixed(1);
      var stars = function(n){ var s=''; for(var i=1;i<=5;i++){s+='<span style="color:'+(i<=n?'#f59e0b':'#d1d5db')+';">★</span>';} return s; };
      var cards = d.reviews.map(function(r){
        return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;break-inside:avoid;">'+
          '<div style="margin-bottom:8px;">'+stars(r.score)+'</div>'+
          '<p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 12px;">"'+r.comment.replace(/"/g,'&quot;')+'</p>'+
          '<p style="color:#6b7280;font-size:13px;font-weight:600;margin:0;">'+
            (r.customer_name||'Client')+
          '</p>'+
        '</div>';
      }).join('');
      root.innerHTML =
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;max-width:960px;margin:0 auto;padding:40px 20px;">'+
        '<div style="text-align:center;margin-bottom:36px;">'+
          '<p style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;margin:0 0 8px;">Client Reviews</p>'+
          '<h2 style="font-size:28px;font-weight:800;color:#111827;margin:0 0 10px;">What Our Clients Say</h2>'+
          '<div style="display:inline-flex;align-items:center;gap:8px;background:#fffbeb;border:1px solid #fcd34d;border-radius:50px;padding:6px 16px;">'+
            '<span style="color:#f59e0b;font-size:18px;">★</span>'+
            '<span style="font-size:15px;font-weight:700;color:#92400e;">'+avg+' / 5</span>'+
            '<span style="font-size:13px;color:#92400e;">· '+d.reviews.length+' review'+(d.reviews.length!==1?'s':'')+'</span>'+
          '</div>'+
        '</div>'+
        '<div style="columns:1;gap:20px;">'+
          '<style>@media(min-width:600px){#vit-reviews [style*=\'columns:1\']{columns:2!important}}@media(min-width:900px){#vit-reviews [style*=\'columns:1\']{columns:3!important}}</style>'+
          cards+
        '</div>'+
        '<div style="text-align:center;margin-top:36px;">'+
          '<a href="'+GOOGLE_URL+'" target="_blank" rel="noreferrer" '+
            'style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;'+
            'font-weight:700;font-size:14px;padding:13px 30px;border-radius:10px;">'+
            '⭐&nbsp; Leave a Google Review'+
          '</a>'+
        '</div>'+
        '</div>';
    })
    .catch(function(){ root.innerHTML = ''; });
})();
</script>`

export default function CsatAnalyticsPage() {
  const supabase = createSupabaseBrowserClient()
  const [responses,      setResponses]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [range,          setRange]          = useState('90')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [activeTab,      setActiveTab]      = useState('analytics')
  const [copied,         setCopied]         = useState(false)
  const [toggling,       setToggling]       = useState(null)

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

  const toggleFeatured = async (r) => {
    setToggling(r.id)
    await supabase
      .from('csat_responses')
      .update({ featured: !r.featured })
      .eq('id', r.id)
    setResponses(prev => prev.map(x => x.id === r.id ? { ...x, featured: !x.featured } : x))
    setToggling(null)
  }

  const copyEmbed = async () => {
    try { await navigator.clipboard.writeText(EMBED_CODE) }
    catch { window.prompt('Copy this embed code:', EMBED_CODE) }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const customers = useMemo(() =>
    [...new Set(responses.map(r => r.customer_name).filter(Boolean))].sort()
  , [responses])

  const filtered = useMemo(() =>
    customerFilter === 'all' ? responses : responses.filter(r => r.customer_name === customerFilter)
  , [responses, customerFilter])

  const featured = useMemo(() => responses.filter(r => r.featured), [responses])

  const score       = avg(filtered)
  const rounded     = Math.round(score * 10) / 10
  const dist        = [5,4,3,2,1].map(n => ({ score: n, count: filtered.filter(r => r.score === n).length }))
  const maxCount    = Math.max(...dist.map(d => d.count), 1)
  const promoters   = filtered.filter(r => r.score >= 4).length
  const detractors  = filtered.filter(r => r.score <= 2).length
  const nps         = filtered.length ? Math.round(((promoters - detractors) / filtered.length) * 100) : 0
  const withComment = filtered.filter(r => r.comment?.trim())
  const half        = Math.floor(filtered.length / 2)
  const trend       = half ? avg(filtered.slice(0, half)) - avg(filtered.slice(half)) : 0

  const byCustomer = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = r.customer_name || 'Unknown'
      if (!map[k]) map[k] = []
      map[k].push(r)
    })
    return Object.entries(map)
      .map(([name, rows]) => ({ name, count: rows.length, avg: avg(rows) }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const byMonth = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const m = new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      if (!map[m]) map[m] = []
      map[m].push(r.score)
    })
    return Object.entries(map)
      .map(([month, scores]) => ({ month, avg: scores.reduce((s,v)=>s+v,0)/scores.length, count: scores.length }))
      .reverse()
  }, [filtered])

  const sel = "px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" /> CSAT & Reviews
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage satisfaction scores and featured reviews.</p>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'analytics', label: 'Analytics' },
          { id: 'responses', label: `All Responses (${filtered.length})` },
          { id: 'featured',  label: `Featured Reviews (${featured.length})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Analytics tab ── */}
          {activeTab === 'analytics' && (
            filtered.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-16 text-center">
                <Star className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No CSAT responses yet</p>
                <p className="text-slate-400 text-sm mt-1">Responses appear after tickets are resolved and surveys are sent.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="Avg Score" icon={Star}
                    value={`${rounded}/5`}
                    sub={`${filtered.length} response${filtered.length !== 1 ? 's' : ''}`}
                    color="bg-amber-500" />
                  <StatCard label="NPS Score" icon={TrendingUp}
                    value={nps > 0 ? `+${nps}` : nps}
                    sub={`${promoters} promoters · ${detractors} detractors`}
                    color={nps >= 30 ? 'bg-emerald-500' : nps >= 0 ? 'bg-amber-500' : 'bg-rose-500'} />
                  <StatCard label="Trend" icon={trend >= 0 ? TrendingUp : TrendingDown}
                    value={trend === 0 ? '—' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}`}
                    sub="vs previous period"
                    color={trend >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} />
                  <StatCard label="Featured" icon={Award}
                    value={featured.length}
                    sub="showing on website"
                    color="bg-violet-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                    <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">Score Distribution</h2>
                    <div className="flex items-start gap-5 mb-5">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-slate-900 dark:text-white">{rounded}</p>
                        <div className="flex gap-0.5 justify-center mt-1">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} className={`w-4 h-4 ${n <= Math.round(score) ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} />
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
                              <div className="bg-amber-400 h-2 rounded-full transition-all" style={{ width: `${(a / 5) * 100}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-8 text-right">{Math.round(a * 10) / 10}</span>
                            <span className="text-xs text-slate-400 w-8 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                    <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">By Customer</h2>
                    {byCustomer.length === 0 ? (
                      <p className="text-slate-400 text-sm text-center py-6">No data</p>
                    ) : (
                      <div className="space-y-2.5">
                        {byCustomer.slice(0, 6).map(({ name, count, avg: a }) => (
                          <div key={name} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{name}</p>
                              <p className="text-xs text-slate-400">{count} response{count !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span className={`text-xs font-bold ${STAR_CLR[Math.round(a)] ?? 'text-slate-500'}`}>
                                {Math.round(a * 10) / 10}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}

          {/* ── All Responses tab ── */}
          {activeTab === 'responses' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white text-sm">All Responses</h2>
                <p className="text-xs text-slate-400">Click the eye icon to feature a review on your website</p>
              </div>
              {filtered.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-12">No responses in this period.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.slice(0, 100).map(r => (
                    <div key={r.id} className={`flex items-start gap-3 px-5 py-4 transition-colors ${r.featured ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'}`}>
                      {/* Score badge */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold mt-0.5 ${STAR_BG[r.score]}`}>
                        {r.score}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {r.customer_name || r.contact_email || 'Anonymous'}
                          </p>
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} className={`w-3 h-3 ${n <= r.score ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} />
                            ))}
                          </div>
                          {r.featured && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                              Featured on website
                            </span>
                          )}
                          {r.google_review_sent && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                              Google review requested
                            </span>
                          )}
                        </div>
                        {r.comment && <p className="text-sm text-slate-600 dark:text-slate-400 break-words mb-1">{r.comment}</p>}
                        {r.ticket_title && <p className="text-xs text-slate-400">Re: {r.ticket_title}</p>}
                      </div>
                      {/* Date + Feature toggle */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <p className="text-xs text-slate-400">{fmtDate(r.submitted_at)}</p>
                        <button
                          onClick={() => toggleFeatured(r)}
                          disabled={toggling === r.id || !r.comment?.trim()}
                          title={!r.comment?.trim() ? 'Only responses with comments can be featured' : r.featured ? 'Remove from website' : 'Feature on website'}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                            r.featured
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-400 hover:border-amber-300 hover:text-amber-600'
                          }`}>
                          {r.featured ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {r.featured ? 'Featured' : 'Feature'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {filtered.length > 100 && (
                    <div className="px-5 py-3 text-center">
                      <p className="text-xs text-slate-400">Showing 100 of {filtered.length} responses</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Featured Reviews tab ── */}
          {activeTab === 'featured' && (
            <div className="space-y-4">
              {/* Embed code card */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">Squarespace Embed Code</h2>
                    <p className="text-xs text-slate-400 max-w-lg">
                      Paste this into a Squarespace Code Block on any page of valhalla-it.net.
                      It automatically loads whichever reviews you've marked as Featured below.
                    </p>
                  </div>
                  <button
                    onClick={copyEmbed}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0 transition-colors ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}>
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Embed Code'}
                  </button>
                </div>
                <div className="mt-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-x-auto">
                  <pre className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono leading-5 select-all">
                    {EMBED_CODE.slice(0, 300)}…
                  </pre>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  <strong>Squarespace steps:</strong> Pages → Edit page → Add Block → Code → Paste → Apply
                </p>
              </div>

              {/* Featured reviews list */}
              {featured.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                  <Eye className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No featured reviews yet</p>
                  <p className="text-slate-400 text-sm mt-1">Go to the All Responses tab and click Feature on any review with a comment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {featured.map(r => (
                    <div key={r.id} className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} className={`w-4 h-4 ${n <= r.score ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                          ))}
                        </div>
                        <button
                          onClick={() => toggleFeatured(r)}
                          disabled={toggling === r.id}
                          className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
                          title="Remove from website">
                          Remove
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3">"{r.comment}"</p>
                      <p className="text-xs font-semibold text-slate-500">{r.customer_name || 'Client'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(r.submitted_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}