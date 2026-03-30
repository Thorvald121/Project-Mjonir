// @ts-nocheck
'use client'

import { useState, useRef, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Upload, FileText, CheckCircle2, AlertTriangle, X,
  ChevronRight, Loader2, Download, ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

// Jira CSV column → Valhalla field mappings
const JIRA_MAP = {
  'Summary':            'title',
  'Description':        'description',
  'Priority':           'priority',
  'Status':             'status',
  'Assignee':           'assigned_to',
  'Reporter':           'contact_email',
  'Created':            'created_at',
  'Resolved':           'resolved_at',
  'Updated':            'updated_at',
  'Issue key':          'source_ref',
  'Issue Type':         'category',
  'Labels':             'tags',
  'Customer Request Type': 'category',
}

const PRIORITY_MAP = {
  'highest': 'critical', 'critical': 'critical',
  'high': 'high',
  'medium': 'medium', 'normal': 'medium',
  'low': 'low', 'lowest': 'low',
}

const STATUS_MAP = {
  'done': 'closed', 'resolved': 'resolved', 'closed': 'closed',
  'complete': 'closed', 'completed': 'closed',
  'in progress': 'in_progress', 'in-progress': 'in_progress',
  'open': 'open', 'to do': 'open', 'todo': 'open', 'new': 'open',
  'waiting': 'waiting', 'pending': 'waiting', 'waiting for customer': 'waiting',
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []
  // Parse header - handle quoted fields
  const parseRow = (line) => {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (c === ',' && !inQ) {
        cols.push(cur.trim()); cur = ''
      } else cur += c
    }
    cols.push(cur.trim())
    return cols
  }
  const headers = parseRow(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseRow(lines[i])
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? '' })
    rows.push(obj)
  }
  return { headers, rows }
}

function mapRow(row, orgId, customerId, customerName) {
  const ticket: any = {
    organization_id: orgId,
    source: 'import',
    status: 'closed',
    priority: 'medium',
    category: 'other',
  }
  if (customerId)   ticket.customer_id   = customerId
  if (customerName) ticket.customer_name = customerName

  for (const [jiraCol, valhallaField] of Object.entries(JIRA_MAP)) {
    const val = row[jiraCol]
    if (!val || val === '') continue

    if (valhallaField === 'priority') {
      ticket.priority = PRIORITY_MAP[val.toLowerCase()] ?? 'medium'
    } else if (valhallaField === 'status') {
      ticket.status = STATUS_MAP[val.toLowerCase()] ?? 'closed'
    } else if (valhallaField === 'category') {
      const cat = val.toLowerCase().replace(/\s+/g, '_')
      const valid = ['software','hardware','network','security','billing','other','maintenance']
      ticket.category = valid.includes(cat) ? cat : 'other'
    } else if (valhallaField === 'tags') {
      ticket.tags = val.split(',').map(t => t.trim()).filter(Boolean)
    } else if (valhallaField === 'created_at' || valhallaField === 'updated_at' || valhallaField === 'resolved_at') {
      try {
        const d = new Date(val)
        if (!isNaN(d.getTime())) ticket[valhallaField] = d.toISOString()
      } catch {}
    } else {
      ticket[valhallaField] = val
    }
  }

  // Ensure title
  if (!ticket.title) ticket.title = row['Summary'] || row['Title'] || row['Issue key'] || 'Imported ticket'
  // Ensure created_at
  if (!ticket.created_at) ticket.created_at = new Date().toISOString()

  return ticket
}

export default function ImportPage() {
  const supabase = createSupabaseBrowserClient()
  const fileRef  = useRef(null)

  const [step,        setStep]        = useState(1) // 1=upload 2=map 3=preview 4=done
  const [headers,     setHeaders]     = useState([])
  const [rows,        setRows]        = useState([])
  const [customers,   setCustomers]   = useState([])
  const [orgId,       setOrgId]       = useState(null)
  const [custId,      setCustId]      = useState('')
  const [custName,    setCustName]    = useState('')
  const [mapped,      setMapped]      = useState([])
  const [importing,   setImporting]   = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [imported,    setImported]    = useState(0)
  const [errors,      setErrors]      = useState([])
  const [dragging,    setDragging]    = useState(false)

  const loadOrg = useCallback(async () => {
    if (orgId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: m } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
    if (m) setOrgId(m.organization_id)
    const { data: c } = await supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200)
    setCustomers(c ?? [])
  }, [orgId])

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.csv')) {
      alert('Please upload a CSV file.')
      return
    }
    await loadOrg()
    const text = await file.text()
    const result = parseCSV(text)
    if (!result || !result.rows.length) { alert('CSV appears empty or invalid.'); return }
    setHeaders(result.headers)
    setRows(result.rows)
    setStep(2)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const buildPreview = () => {
    const cust = customers.find(c => c.id === custId)
    const name = cust?.name || custName || ''
    const tickets = rows.map(r => mapRow(r, orgId, custId || null, name))
    setMapped(tickets)
    setStep(3)
  }

  const runImport = async () => {
    setImporting(true)
    setProgress(0)
    setErrors([])
    let ok = 0
    const errs = []
    const BATCH = 50
    for (let i = 0; i < mapped.length; i += BATCH) {
      const batch = mapped.slice(i, i + BATCH)
      const { error } = await supabase.from('tickets').insert(batch)
      if (error) {
        errs.push(`Rows ${i+1}-${Math.min(i+BATCH, mapped.length)}: ${error.message}`)
      } else {
        ok += batch.length
      }
      setProgress(Math.round(((i + BATCH) / mapped.length) * 100))
      setImported(ok)
    }
    setErrors(errs)
    setImporting(false)
    setStep(4)
  }

  const inp = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

  const STEPS = ['Upload', 'Configure', 'Preview', 'Done']

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Import from Jira / Atlassian</h1>
          <p className="text-sm text-slate-500 mt-0.5">Import historical ticket data from a Jira Service Management CSV export</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step > i+1 ? 'bg-emerald-500 text-white' :
              step === i+1 ? 'bg-amber-500 text-white' :
              'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}>
              {step > i+1 ? <CheckCircle2 className="w-4 h-4" /> : i+1}
            </div>
            <span className={`text-sm font-medium ${step === i+1 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-semibold">How to export from Jira Service Management:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
              <li>Go to your Jira project → Issues</li>
              <li>Click <strong>Export</strong> → <strong>Export CSV (all fields)</strong></li>
              <li>Upload the downloaded CSV file below</li>
            </ol>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <Upload className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">Drop your Jira CSV here</p>
            <p className="text-sm text-slate-400 mt-1">or click to browse</p>
            <p className="text-xs text-slate-300 dark:text-slate-600 mt-3">Supports Jira Service Management CSV exports</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Step 2 — Configure */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{rows.length.toLocaleString()} tickets detected</p>
                <p className="text-xs text-slate-400">{headers.length} columns: {headers.slice(0,5).join(', ')}{headers.length > 5 ? ` +${headers.length - 5} more` : ''}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Link to Customer (optional)</label>
                <p className="text-xs text-slate-400 mb-1.5">Attach all imported tickets to a specific customer, or leave blank</p>
                <select value={custId} onChange={e => setCustId(e.target.value)} className={`w-full mt-1 ${inp}`}>
                  <option value="">No specific customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {!custId && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Or enter customer name</label>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="e.g. Acme Corp" className={`w-full mt-1 ${inp}`} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Column Mapping Preview</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Object.entries(JIRA_MAP).filter(([jiraCol]) => headers.includes(jiraCol)).map(([jiraCol, valhallaField]) => (
                  <div key={jiraCol} className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono">{jiraCol}</span>
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono">{valhallaField}</span>
                  </div>
                ))}
                {headers.filter(h => !JIRA_MAP[h]).length > 0 && (
                  <p className="text-xs text-slate-400 pt-1">
                    {headers.filter(h => !JIRA_MAP[h]).length} columns will be skipped (not mapped)
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Back
            </button>
            <button onClick={buildPreview} className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Preview */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <p className="font-semibold text-slate-900 dark:text-white text-sm">Preview — first 10 of {mapped.length} tickets</p>
              <span className="text-xs text-slate-400">All will be imported as closed/historical records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    {['Title','Status','Priority','Category','Assignee','Created'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mapped.slice(0, 10).map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white max-w-[200px] truncate">{t.title}</td>
                      <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{t.status}</span></td>
                      <td className="px-3 py-2.5 capitalize">{t.priority}</td>
                      <td className="px-3 py-2.5 capitalize">{t.category}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 max-w-[140px] truncate">{t.assigned_to || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mapped.length > 10 && (
              <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                + {mapped.length - 10} more tickets
              </div>
            )}
          </div>

          {importing && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                <p className="font-semibold text-slate-900 dark:text-white text-sm">Importing… {imported}/{mapped.length}</p>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} disabled={importing} className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
              Back
            </button>
            <button onClick={runImport} disabled={importing}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : `Import ${mapped.length.toLocaleString()} Tickets`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Done */}
      {step === 4 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          {errors.length === 0 ? (
            <>
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Import Complete</h2>
              <p className="text-slate-500">{imported.toLocaleString()} tickets imported successfully from Jira</p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Import finished with errors</h2>
              <p className="text-slate-500">{imported.toLocaleString()} imported, {errors.length} batch(es) failed</p>
              <div className="text-left bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-xs text-rose-700 dark:text-rose-400 space-y-1">
                {errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <button onClick={() => { setStep(1); setRows([]); setHeaders([]); setMapped([]); setErrors([]) }}
              className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Import Another File
            </button>
            <Link href="/tickets"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors">
              View Tickets →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}