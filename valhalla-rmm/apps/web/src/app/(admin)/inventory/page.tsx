// @ts-nocheck
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Plus, Search, Package, AlertTriangle,
  Edit, Trash2, Loader2, Upload, Download, X, Terminal,
} from 'lucide-react'

function LinkedTicketsBadge({ assetId }) {
  const supabase = createSupabaseBrowserClient()
  const router   = useRouter()
  const [tickets, setTickets] = useState(null)

  useEffect(() => {
    supabase.from('tickets').select('id,title,status').eq('linked_asset_id', assetId).limit(10)
      .then(({ data }) => setTickets(data ?? []))
  }, [assetId])

  if (tickets === null) return null
  if (tickets.length === 0) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>

  const open = tickets.filter(t => !['resolved','closed'].includes(t.status))
  return (
    <div className="flex flex-col gap-1">
      {tickets.slice(0, 2).map(t => (
        <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
          className="flex items-center gap-1.5 text-left hover:underline">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${['resolved','closed'].includes(t.status) ? 'bg-slate-300' : 'bg-amber-500'}`} />
          <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[120px]">{t.title}</span>
        </button>
      ))}
      {tickets.length > 2 && (
        <span className="text-[11px] text-slate-400">+{tickets.length - 2} more</span>
      )}
    </div>
  )
}

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

const CAT_CLS = {
  hardware:   'bg-blue-100 text-blue-700',
  software:   'bg-purple-100 text-purple-700',
  license:    'bg-violet-100 text-violet-700',
  consumable: 'bg-amber-100 text-amber-700',
  networking: 'bg-teal-100 text-teal-700',
  other:      'bg-slate-100 text-slate-600',
}
const STATUS_CLS = {
  in_stock:    'bg-emerald-100 text-emerald-700',
  deployed:    'bg-blue-100 text-blue-700',
  retired:     'bg-slate-100 text-slate-500',
  ordered:     'bg-amber-100 text-amber-700',
  maintenance: 'bg-orange-100 text-orange-700',
}
const CATEGORIES = ['hardware','software','license','consumable','networking','other']
const STATUSES   = ['in_stock','deployed','ordered','maintenance','retired']
const lbl = (s) => s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())

const inp = "w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"

const BLANK = {
  name:'', description:'', category:'hardware', status:'in_stock',
  quantity:'1', unit_cost:'', vendor:'', model:'', serial_number:'',
  asset_tag:'', customer_id:'', customer_name:'', location:'',
  purchase_date:'', warranty_expiry:'', notes:'',
}

function warrantyInfo(dateStr) {
  if (!dateStr) return null
  const days = Math.round((new Date(dateStr) - new Date()) / 86400000)
  return { days, expired: days < 0, expiring: days >= 0 && days <= 30 }
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

// ── CSV Import ────────────────────────────────────────────────────────────────
const CSV_FIELDS = [
  { key:'name',            label:'Name *',         required:true  },
  { key:'serial_number',   label:'Serial Number'                  },
  { key:'asset_tag',       label:'Asset Tag'                      },
  { key:'status',          label:'Status'                         },
  { key:'category',        label:'Category'                       },
  { key:'vendor',          label:'Vendor'                         },
  { key:'model',           label:'Model'                          },
  { key:'quantity',        label:'Quantity'                       },
  { key:'unit_cost',       label:'Unit Cost ($)'                  },
  { key:'customer_name',   label:'Customer Name'                  },
  { key:'location',        label:'Location'                       },
  { key:'purchase_date',   label:'Purchase Date'                  },
  { key:'warranty_expiry', label:'Warranty Expiry'                },
  { key:'notes',           label:'Notes'                          },
]
const CSV_ALIASES = {
  name:            ['name','item name','asset name','device name','product','title'],
  serial_number:   ['serial','serial number','sn','s/n','serialno','serial number'],
  asset_tag:       ['asset tag','asset#','tag','asset id','asset number'],
  status:          ['status','state','condition','device status'],
  category:        ['category','type','item type','asset type','os','os name'],
  vendor:          ['vendor','manufacturer','make','brand','system manufacturer'],
  model:           ['model','model number','part number','sku','system model'],
  quantity:        ['quantity','qty','count'],
  unit_cost:       ['cost','unit cost','price','value'],
  customer_name:   ['customer','customer name','client','assigned to','company'],
  location:        ['location','site','room','place','device group'],
  purchase_date:   ['purchase date','purchased','buy date','date purchased','registered'],
  warranty_expiry: ['warranty expiry','warranty end','warranty expires','expiry'],
  os:              ['os version','os name','os'],
  ip_address:      ['internal ip','ip address','ip'],
  external_ip:     ['external ip'],
  last_seen:       ['last activity','last seen','last active'],
  notes:           ['notes','comments','remarks','description'],
}

// Detect if this is an ITarian/Xcitium CSV export
function isItarianCsv(headers) {
  const h = headers.map(x => x.toLowerCase())
  return h.includes('device status') && h.includes('customer') && h.includes('last activity') && h.includes('ccc version')
}

// Map ITarian device status to our inventory status
function normaliseItarianStatus(v) {
  const s = (v||'').toLowerCase().trim()
  if (s === 'online' || s === 'connected') return 'deployed'
  if (s === 'offline' || s === 'disconnected') return 'deployed' // still deployed, just offline
  return 'deployed'
}

function normaliseStatus(v) {
  const s = (v||'').toLowerCase().trim().replace(/[\s-]+/g,'_')
  if (STATUSES.includes(s)) return s
  if (s.includes('stock')||s==='available') return 'in_stock'
  if (s.includes('deploy')||s==='active'||s==='in use') return 'deployed'
  if (s.includes('order')||s==='pending') return 'ordered'
  if (s.includes('maint')||s==='repair') return 'maintenance'
  if (s.includes('retir')||s==='decommission') return 'retired'
  return 'in_stock'
}

function normaliseCategory(v) {
  const s = (v||'').toLowerCase().trim()
  if (CATEGORIES.includes(s)) return s
  if (s.includes('hard')||s==='computer'||s==='laptop'||s==='desktop'||s==='printer'||s==='monitor') return 'hardware'
  if (s.includes('soft')||s==='app'||s==='application') return 'software'
  if (s.includes('licen')) return 'license'
  if (s.includes('consum')||s==='supply'||s==='supplies') return 'consumable'
  if (s.includes('network')||s==='switch'||s==='router'||s==='firewall'||s==='wifi') return 'networking'
  return 'other'
}

function CsvImportDialog({ open, onClose, onImported, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const fileRef  = useRef(null)
  const [headers,  setHeaders]  = useState([])
  const [rows,     setRows]     = useState([])
  const [mapping,  setMapping]  = useState({})
  const [preview,  setPreview]  = useState([])
  const [errors,   setErrors]   = useState([])
  const [importing,setImporting]= useState(false)
  const [done,     setDone]     = useState(false)
  const [imported, setImported] = useState(0)

  const reset = () => { setHeaders([]); setRows([]); setMapping({}); setPreview([]); setErrors([]); setDone(false); setImported(0) }

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = e.target.result.split('\n').filter(l => l.trim())
      if (lines.length < 2) return
      const hdrs = lines[0].split(',').map(h => h.replace(/"/g,'').trim())
      const data = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || []
        const obj = {}
        hdrs.forEach((h, i) => { obj[h] = (vals[i]||'').replace(/^"|"$/g,'').trim() })
        return obj
      }).filter(r => Object.values(r).some(v => v))
      setHeaders(hdrs); setRows(data)

      // Auto-map — with special handling for ITarian CSV format
      const autoMap = {}
      if (isItarianCsv(hdrs)) {
        // ITarian column → our field, direct mapping
        const itarianMap = {
          'Name':           'name',
          'Serial Number':  'serial_number',
          'Device status':  'status',
          'Customer':       'customer_name',
          'OS name':        'category',
          'Model':          'model',
          'System Manufacturer': 'vendor',
          'Internal IP':    'ip_address',
          'External IP':    'external_ip',
          'Last Activity':  'last_seen',
          'OS version':     'os',
          'Device Group':   'location',
          'Registered':     'purchase_date',
          'Notes':          'notes',
        }
        hdrs.forEach(h => { if (itarianMap[h]) autoMap[itarianMap[h]] = h })
        autoMap._itarian = true  // flag for special import handling
      } else {
        hdrs.forEach(h => {
          const hl = h.toLowerCase().trim()
          for (const [field, aliases] of Object.entries(CSV_ALIASES)) {
            if (aliases.some(a => hl === a || hl.includes(a))) { autoMap[field] = h; break }
          }
        })
      }
      setMapping(autoMap)
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (!rows.length || !Object.keys(mapping).length) { setPreview([]); setErrors([]); return }
    const errs = []; const prev = []
    rows.slice(0,3).forEach((row, i) => {
      const name = mapping.name ? row[mapping.name] : ''
      if (!name.trim()) errs.push(`Row ${i+2}: missing Name`)
      prev.push({
        name: name || '(missing)',
        category: mapping.category ? normaliseCategory(row[mapping.category]) : 'hardware',
        status:   mapping.status   ? normaliseStatus(row[mapping.status])     : 'in_stock',
        serial_number: mapping.serial_number ? row[mapping.serial_number] : '',
      })
    })
    setPreview(prev); setErrors(errs)
  }, [mapping, rows])

  const handleImport = async () => {
    setImporting(true)
    let count = 0
    const isItarian = !!mapping._itarian

    for (const row of rows) {
      const name = mapping.name ? row[mapping.name]?.trim() : ''
      if (!name) continue

      const custName  = mapping.customer_name ? row[mapping.customer_name]?.trim() : ''
      const cust      = custName ? customers.find(c => c.name.toLowerCase() === custName.toLowerCase()) : null
      const serial    = mapping.serial_number ? row[mapping.serial_number]?.trim() : null
      const lastSeen  = mapping.last_seen     ? row[mapping.last_seen]?.trim()     : null

      // Parse last activity date from ITarian format: "2026/04/27 03:35:20 PM"
      let lastSeenAt = null
      if (lastSeen) {
        try { lastSeenAt = new Date(lastSeen).toISOString() } catch {}
      }

      // For ITarian: determine online status from Device status column
      const deviceStatus = isItarian && mapping.status ? row[mapping.status]?.trim() : null
      const isOnline = deviceStatus ? ['Online','Connected'].includes(deviceStatus) : null

      // Category from OS for ITarian
      let category = 'hardware'
      if (isItarian && mapping.category) {
        const os = row[mapping.category]?.toLowerCase() || ''
        if (os.includes('windows'))    category = 'hardware'
        else if (os.includes('macos')) category = 'hardware'
        else if (os.includes('linux')) category = 'hardware'
        else if (os.includes('ios') || os.includes('android')) category = 'other'
      } else if (mapping.category) {
        category = normaliseCategory(row[mapping.category])
      }

      const payload = {
        organization_id: orgId,
        name,
        category,
        status:          isItarian ? 'deployed' : (mapping.status ? normaliseStatus(row[mapping.status]) : 'in_stock'),
        quantity:        1,
        vendor:          mapping.vendor         ? row[mapping.vendor]?.trim()||null         : null,
        model:           mapping.model          ? row[mapping.model]?.trim()||null          : null,
        serial_number:   serial                 || null,
        customer_id:     cust?.id               || null,
        customer_name:   custName               || null,
        location:        mapping.location       ? row[mapping.location]?.trim()||null       : null,
        purchase_date:   mapping.purchase_date  ? row[mapping.purchase_date]?.trim()||null  : null,
        notes:           mapping.notes          ? row[mapping.notes]?.trim()||null          : null,
        // ITarian-specific enrichment fields
        ip_address:      mapping.ip_address     ? row[mapping.ip_address]?.trim()||null     : null,
        last_seen_at:    lastSeenAt             || null,
        os:              mapping.os             ? row[mapping.os]?.trim()||null             : null,
        online:          isOnline,
        source:          isItarian ? 'xcitium' : 'manual',
      }

      // Upsert by serial number if available, otherwise by name + customer
      if (serial) {
        const { data: existing } = await supabase
          .from('inventory_items')
          .select('id')
          .eq('organization_id', orgId)
          .eq('serial_number', serial)
          .single()
        if (existing) {
          await supabase.from('inventory_items').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('inventory_items').insert(payload)
        }
      } else {
        await supabase.from('inventory_items').insert(payload)
      }
      count++
    }
    setImported(count); setDone(true); setImporting(false)
    onImported()
  }

  const downloadTemplate = () => {
    const cols = CSV_FIELDS.map(f => f.label.replace(' *','')).join(',')
    const sample = 'Dell Latitude 5540,SN12345,ASSET-001,deployed,hardware,Dell,Latitude 5540,1,1200,Acme Corp,Server Room,2024-01-15,2027-01-15,Main office laptop'
    const blob = new Blob([cols+'\n'+sample], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inventory_template.csv'; a.click()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">Import Inventory from CSV</h2>
          <button onClick={() => { reset(); onClose() }} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <Package className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{imported} items imported!</p>
              <button onClick={() => { reset(); onClose() }} className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold">Done</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Upload a CSV file with your inventory data.</p>
                <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium">
                  <Download className="w-3.5 h-3.5" /> Download Template
                </button>
              </div>

              {!rows.length ? (
                <div
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-10 text-center cursor-pointer hover:border-amber-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}>
                  <Upload className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Drop a CSV file here or click to browse</p>
                  <p className="text-xs text-slate-400 mt-1">Supports .csv files up to 5MB</p>
                  <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={e => handleFile(e.target.files[0])} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{rows.length} rows detected</p>
                    <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">Remove file</button>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Map CSV Columns to Fields</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CSV_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-28 flex-shrink-0">{field.label}</span>
                          <select value={mapping[field.key] || '__none__'}
                            onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value === '__none__' ? undefined : e.target.value }))}
                            className="flex-1 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500">
                            <option value="__none__">— Skip —</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-1">
                      {errors.map((e, i) => <p key={i} className="text-xs text-rose-700">{e}</p>)}
                    </div>
                  )}

                  {preview.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preview (first 3 rows)</p>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        {preview.map((row, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white flex-1 truncate">{row.name}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CAT_CLS[row.category] ?? ''}`}>{row.category}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[row.status] ?? ''}`}>{lbl(row.status)}</span>
                            {row.serial_number && <span className="text-xs text-slate-400 font-mono">{row.serial_number}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => { reset(); onClose() }} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                    <button onClick={handleImport} disabled={importing || !mapping.name || errors.length > 0}
                      className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                      {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                      {importing ? `Importing ${imported}/${rows.length}…` : `Import ${rows.length} Items`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Item Form Dialog ──────────────────────────────────────────────────────────
function ItemDialog({ open, onClose, onSaved, editing, orgId, customers }) {
  const supabase = createSupabaseBrowserClient()
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name:            editing.name            || '',
        description:     editing.description     || '',
        category:        editing.category        || 'hardware',
        status:          editing.status          || 'in_stock',
        quantity:        String(editing.quantity ?? 1),
        unit_cost:       editing.unit_cost != null ? String(editing.unit_cost) : '',
        vendor:          editing.vendor          || '',
        model:           editing.model           || '',
        serial_number:   editing.serial_number   || '',
        asset_tag:       editing.asset_tag       || '',
        customer_id:     editing.customer_id     || '',
        customer_name:   editing.customer_name   || '',
        location:        editing.location        || '',
        purchase_date:   editing.purchase_date   || '',
        warranty_expiry: editing.warranty_expiry || '',
        notes:           editing.notes           || '',
      })
    } else { setForm({ ...BLANK }) }
  }, [editing, open])

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (!orgId) { setErr('Organization not found'); return }
    setSaving(true); setErr(null)
    const payload = {
      organization_id: orgId,
      name:            form.name.trim(),
      description:     form.description || null,
      category:        form.category,
      status:          form.status,
      quantity:        parseInt(form.quantity) || 1,
      unit_cost:       form.unit_cost !== '' ? parseFloat(form.unit_cost) : null,
      vendor:          form.vendor || null,
      model:           form.model || null,
      serial_number:   form.serial_number || null,
      asset_tag:       form.asset_tag || null,
      customer_id:     form.customer_id || null,
      customer_name:   form.customer_name || null,
      location:        form.location || null,
      purchase_date:   form.purchase_date || null,
      warranty_expiry: form.warranty_expiry || null,
      notes:           form.notes || null,
    }
    const { error } = editing
      ? await supabase.from('inventory_items').update(payload).eq('id', editing.id)
      : await supabase.from('inventory_items').insert(payload)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-white">{editing ? 'Edit Inventory Item' : 'Add Inventory Item'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <p className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2 rounded-lg">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name *</label>
              <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g., Dell Latitude 5540 Laptop" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <select value={form.category} onChange={e => s('category', e.target.value)} className={`mt-1 ${inp}`}>
                {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <select value={form.status} onChange={e => s('status', e.target.value)} className={`mt-1 ${inp}`}>
                {STATUSES.map(st => <option key={st} value={st}>{lbl(st)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor / Manufacturer</label>
              <input value={form.vendor} onChange={e => s('vendor', e.target.value)} placeholder="Dell, HP, Cisco..." className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Model</label>
              <input value={form.model} onChange={e => s('model', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Serial Number</label>
              <input value={form.serial_number} onChange={e => s('serial_number', e.target.value)} className={`mt-1 ${inp} font-mono`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Asset Tag</label>
              <input value={form.asset_tag} onChange={e => s('asset_tag', e.target.value)} placeholder="ASSET-001" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quantity</label>
              <input type="number" min={1} value={form.quantity} onChange={e => s('quantity', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit Cost ($)</label>
              <input type="number" min={0} step="0.01" value={form.unit_cost} onChange={e => s('unit_cost', e.target.value)} placeholder="0.00" className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Customer</label>
              <select value={form.customer_id || '__none__'} onChange={e => {
                const c = customers.find(x => x.id === e.target.value)
                s('customer_id', e.target.value === '__none__' ? '' : e.target.value)
                s('customer_name', c?.name || '')
              }} className={`mt-1 ${inp}`}>
                <option value="__none__">Not Assigned</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</label>
              <input value={form.location} onChange={e => s('location', e.target.value)} placeholder="Server Room, Office 2..." className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={e => s('purchase_date', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Warranty Expiry</label>
              <input type="date" value={form.warranty_expiry} onChange={e => s('warranty_expiry', e.target.value)} className={`mt-1 ${inp}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
              <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={2} placeholder="Any additional notes..." className={`mt-1 ${inp} resize-none`} />
            </div>
          </div>

          {/* Agent-collected data — read only */}
          {editing && (editing.last_seen_at || editing.ip_address || editing.os || editing.cpu) && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Agent Data <span className="font-normal text-slate-400 normal-case">(auto-collected, read-only)</span></p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {editing.last_seen_at && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">Last seen</span><span className="text-slate-700 dark:text-slate-300">{new Date(editing.last_seen_at).toLocaleString()}</span></div>}
                {editing.ip_address   && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">IP address</span><span className="text-slate-700 dark:text-slate-300 font-mono">{editing.ip_address}</span></div>}
                {editing.mac_address  && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">MAC address</span><span className="text-slate-700 dark:text-slate-300 font-mono">{editing.mac_address}</span></div>}
                {editing.os           && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">OS</span><span className="text-slate-700 dark:text-slate-300">{editing.os}</span></div>}
                {editing.cpu          && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">CPU</span><span className="text-slate-700 dark:text-slate-300">{editing.cpu}</span></div>}
                {editing.ram_gb       && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">RAM</span><span className="text-slate-700 dark:text-slate-300">{editing.ram_gb} GB</span></div>}
                {editing.disk_gb      && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">Disk</span><span className="text-slate-700 dark:text-slate-300">{editing.disk_gb} GB total{editing.disk_free_gb ? `, ${editing.disk_free_gb} GB free` : ''}</span></div>}
                {editing.hostname     && <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">Hostname</span><span className="text-slate-700 dark:text-slate-300 font-mono">{editing.hostname}</span></div>}
                {editing.agent_version&& <div className="flex gap-2"><span className="text-slate-400 w-24 flex-shrink-0">Agent</span><span className="text-slate-700 dark:text-slate-300">{editing.agent_version}</span></div>}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.name.trim() || saving}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const supabase = createSupabaseBrowserClient()

  const [items,          setItems]          = useState([])
  const [customers,      setCustomers]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [orgId,          setOrgId]          = useState(null)
  const [search,         setSearch]         = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [dialogOpen,     setDialogOpen]     = useState(false)
  const [agentOpen,      setAgentOpen]      = useState(false)
  const [importOpen,     setImportOpen]     = useState(false)
  const [editing,        setEditing]        = useState(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member) setOrgId(member.organization_id)
      loadAll()
    }
    init()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    const [inv, cust] = await Promise.all([
      supabase.from('inventory_items').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('customers').select('id,name').eq('status','active').order('name').limit(200),
    ])
    setItems(inv.data ?? [])
    setCustomers(cust.data ?? [])
    setLoading(false)
  }

  useRealtimeRefresh(['inventory_items'], loadAll)


  const handleDelete = async (id) => {
    if (!confirm('Delete this inventory item? This cannot be undone.')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    loadAll()
  }

  const filtered = useMemo(() => items.filter(item => {
    const q = search.toLowerCase()
    if (q && !item.name?.toLowerCase().includes(q) && !item.serial_number?.toLowerCase().includes(q) && !item.asset_tag?.toLowerCase().includes(q) && !item.customer_name?.toLowerCase().includes(q) && !item.vendor?.toLowerCase().includes(q)) return false
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    if (statusFilter   !== 'all' && item.status   !== statusFilter)   return false
    return true
  }), [items, search, categoryFilter, statusFilter])

  const expiringCount = items.filter(i => { const w = warrantyInfo(i.warranty_expiry); return w?.expiring }).length
  const totalValue    = items.reduce((s, i) => s + ((i.unit_cost || 0) * (i.quantity || 1)), 0)

  const sel = "px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Items',             value: items.length,                                          color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Deployed',                value: items.filter(i => i.status==='deployed').length,       color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-950/30' },
          { label: 'In Stock',                value: items.filter(i => i.status==='in_stock').length,       color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Warranty Expiring (30d)', value: expiringCount,                                         color: expiringCount > 0 ? 'text-amber-500' : 'text-slate-400', bg: expiringCount > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-slate-50 dark:bg-slate-800' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <Package className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, serial, asset tag, vendor…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={sel}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{lbl(c)}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={sel}>
            <option value="all">All Status</option>
            {STATUSES.map(st => <option key={st} value={st}>{lbl(st)}</option>)}
          </select>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setAgentOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 rounded-lg text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors">
            <Terminal className="w-4 h-4" /> Agent Setup
          </button>
        </div>
        <button onClick={() => { setEditing(null); setDialogOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Agent Setup Panel */}
      {agentOpen && orgId && (
        <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2"><Terminal className="w-4 h-4 text-violet-400" /> Asset Agent Setup</p>
              <p className="text-xs text-slate-400 mt-0.5">Run this script on any client machine to auto-register it as an inventory item. Runs in seconds — no software installed.</p>
            </div>
            <button onClick={() => setAgentOpen(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-violet-400 mb-1.5">Windows (PowerShell — run as Administrator)</p>
              <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all">
                {`.\register-windows.ps1 -OrgId "${orgId}" -ApiKey "YOUR_ANON_KEY"`}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-400 mb-1.5">macOS / Linux (Terminal)</p>
              <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all">
                {`./register-macos-linux.sh --org-id "${orgId}" --api-key "YOUR_ANON_KEY"`}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Replace <span className="text-slate-400 font-mono">YOUR_ANON_KEY</span> with your Supabase anon key. Download scripts from{' '}
              <a href="/agent" target="_blank" className="text-violet-400 hover:underline">/agent</a>.
            </p>
          </div>

          {/* Heartbeat scheduling */}
          <div className="border-t border-slate-700 pt-4 space-y-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Schedule Heartbeat (keep devices updated automatically)
            </p>
            <p className="text-xs text-slate-400">Run once to set up — the agent will check in daily and update disk, RAM, IP, and OS info automatically.</p>
            <div>
              <p className="text-xs font-semibold text-violet-400 mb-1.5">Windows — Task Scheduler (run as Administrator)</p>
              <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all select-all">
                {`$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NonInteractive -File C:\valhalla-agent\register-windows.ps1 -OrgId \"${orgId}\" -ApiKey \"YOUR_ANON_KEY\""
$trigger = New-ScheduledTaskTrigger -Daily -At 8am
Register-ScheduledTask -TaskName "Valhalla IT Agent" -Action $action -Trigger $trigger -RunLevel Highest`}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-violet-400 mb-1.5">macOS / Linux — cron (daily at 8am)</p>
              <div className="bg-slate-950 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all select-all">
                {`echo "0 8 * * * /path/to/register-macos-linux.sh --org-id \"${orgId}\" --api-key \"YOUR_ANON_KEY\"" | crontab -`}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Devices that haven't checked in for 7+ days will show <span className="text-rose-400">Offline</span> in Device Health and auto-create an alert ticket.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                {['Name / Model','Category','Serial / Asset Tag','Customer','Qty','Status','Warranty','Tickets',''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_,j) => (
                    <td key={j} className="px-3 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-20" /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-400 text-sm">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    {items.length === 0 ? "No inventory items yet. Click 'Add Item' to get started." : 'No items match your filters.'}
                  </td>
                </tr>
              ) : filtered.map(item => {
                const w = warrantyInfo(item.warranty_expiry)
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                      {(item.vendor || item.manufacturer || item.model) && (
                        <p className="text-xs text-slate-400">{[item.vendor || item.manufacturer, item.model].filter(Boolean).join(' ')}</p>
                      )}
                      {item.os && <p className="text-xs text-slate-400">{item.os}</p>}
                      {item.last_seen_at ? (() => {
                        const ms = Date.now() - new Date(item.last_seen_at).getTime()
                        const days = ms / 86400000
                        const ago = (() => { const s = Math.round(ms/1000); if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` })()
                        const color = days > 7 ? 'text-rose-600 dark:text-rose-400' : days > 1 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        const dot   = days > 7 ? 'bg-rose-500' : days > 1 ? 'bg-amber-500' : 'bg-emerald-500'
                        return (
                          <p className={`text-[11px] ${color} flex items-center gap-1 mt-0.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block`} />
                            {days > 7 ? `Offline · ${ago}` : days > 1 ? `Stale · ${ago}` : `Last seen ${ago}`}
                          </p>
                        )
                      })() : item.category === 'hardware' ? (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />
                          No agent
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CAT_CLS[item.category] ?? ''}`}>{item.category}</span>
                    </td>
                    <td className="px-3 py-3">
                      {item.serial_number && <p className="font-mono text-xs text-slate-900 dark:text-white">{item.serial_number}</p>}
                      {item.asset_tag && <p className="text-xs text-slate-400">#{item.asset_tag}</p>}
                      {!item.serial_number && !item.asset_tag && <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{item.customer_name || '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-900 dark:text-white">{item.quantity}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[item.status] ?? ''}`}>{lbl(item.status)}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {w ? (
                        <div className={`flex items-center gap-1 text-xs font-medium ${w.expired ? 'text-rose-600' : w.expiring ? 'text-amber-600' : 'text-slate-400'}`}>
                          {(w.expired || w.expiring) && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                          {w.expired ? 'Expired' : w.expiring ? `${w.days}d left` : fmtDate(item.warranty_expiry)}
                        </div>
                      ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <LinkedTicketsBadge assetId={item.id} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(item); setDialogOpen(true) }}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{filtered.length} items</span>
            {totalValue > 0 && <span>Total value: <strong className="text-slate-700 dark:text-slate-300">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>}
          </div>
        )}
      </div>

      <ItemDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null) }}
        onSaved={() => { setDialogOpen(false); setEditing(null); loadAll() }}
        editing={editing} orgId={orgId} customers={customers}
      />
      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); loadAll() }}
        orgId={orgId} customers={customers}
      />
    </div>
  )
}