// @ts-nocheck
// apps/web/src/components/QuoteAttachments.tsx

'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  Paperclip, Upload, Trash2, Eye, EyeOff, Loader2,
  FileText, FileImage, File, Download, AlertTriangle,
  CheckCircle2, Lock, Globe,
} from 'lucide-react'

// ── File type helpers ─────────────────────────────────────────────────────────
function FileIcon({ type }) {
  if (type?.startsWith('image/')) return <FileImage className="w-4 h-4 text-blue-500" />
  if (type === 'application/pdf') return <FileText className="w-4 h-4 text-rose-500" />
  return <File className="w-4 h-4 text-slate-400" />
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function QuoteAttachments({
  quoteId,
  orgId,
  readOnly = false,
}: {
  quoteId: string
  orgId: string
  readOnly?: boolean
}) {
  const supabase    = createSupabaseBrowserClient()
  const fileRef     = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState([])
  const [uploading,   setUploading]   = useState(false)
  const [uploadErr,   setUploadErr]   = useState(null)
  const [dragOver,    setDragOver]    = useState(false)
  const [loading,     setLoading]     = useState(true)

  // ── Load attachments ────────────────────────────────────────────────────────
  const load = async () => {
    const { data } = await supabase
      .from('quote_attachments')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })
    setAttachments(data ?? [])
    setLoading(false)
  }

  useEffect(() => { if (quoteId) load() }, [quoteId])

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadErr(null)

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        setUploadErr(`${file.name} is over 20 MB — skipped`)
        continue
      }

      const ext          = file.name.split('.').pop()
      const safeName     = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath  = `${orgId}/${quoteId}/${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage
        .from('quote-attachments')
        .upload(storagePath, file, { contentType: file.type, upsert: false })

      if (upErr) {
        setUploadErr(`Failed to upload ${file.name}: ${upErr.message}`)
        continue
      }

      const { data: { user } } = await supabase.auth.getUser()

      const { error: dbErr } = await supabase.from('quote_attachments').insert({
        organization_id:   orgId,
        quote_id:          quoteId,
        file_name:         file.name,
        file_size:         file.size,
        file_type:         file.type,
        storage_path:      storagePath,
        is_client_visible: false,
        uploaded_by:       user?.email ?? null,
      })

      if (dbErr) setUploadErr(`Saved file but failed to record: ${dbErr.message}`)
    }

    await load()
    setUploading(false)
  }

  // ── Toggle visibility ───────────────────────────────────────────────────────
  const toggleVisibility = async (id: string, current: boolean) => {
    await supabase
      .from('quote_attachments')
      .update({ is_client_visible: !current })
      .eq('id', id)
    setAttachments(prev => prev.map(a => a.id === id ? { ...a, is_client_visible: !current } : a))
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteAttachment = async (attachment) => {
    if (!confirm(`Delete "${attachment.file_name}"?`)) return

    await supabase.storage
      .from('quote-attachments')
      .remove([attachment.storage_path])

    await supabase
      .from('quote_attachments')
      .delete()
      .eq('id', attachment.id)

    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
  }

  // ── Download ────────────────────────────────────────────────────────────────
  const downloadFile = async (attachment) => {
    const { data } = await supabase.storage
      .from('quote-attachments')
      .createSignedUrl(attachment.storage_path, 60)

    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = attachment.file_name
      a.click()
    }
  }

  // ── Drag and drop ───────────────────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = ()  => setDragOver(false)
  const onDrop      = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading attachments…
    </div>
  )

  const clientVisible  = attachments.filter(a => a.is_client_visible)
  const internalOnly   = attachments.filter(a => !a.is_client_visible)

  return (
    <div className="space-y-4">

      {/* Upload zone — hidden in readOnly mode */}
      {!readOnly && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 hover:bg-slate-50 dark:hover:bg-slate-800/30'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          {uploading ? (
            <>
              <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Uploading…</p>
            </>
          ) : (
            <>
              <Upload className="w-7 h-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drop files here or <span className="text-amber-600">click to upload</span>
              </p>
              <p className="text-xs text-slate-400">PDF, Word, Excel, images, CSV — max 20 MB each</p>
            </>
          )}
        </div>
      )}

      {uploadErr && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">{uploadErr}</p>
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <Paperclip className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
          <p className="text-sm">No attachments yet</p>
        </div>
      ) : (
        <div className="space-y-3">

          {/* Client-visible files */}
          {clientVisible.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                  Visible to client ({clientVisible.length})
                </p>
              </div>
              <div className="space-y-1.5">
                {clientVisible.map(a => (
                  <AttachmentRow
                    key={a.id}
                    attachment={a}
                    readOnly={readOnly}
                    onToggle={() => toggleVisibility(a.id, a.is_client_visible)}
                    onDelete={() => deleteAttachment(a)}
                    onDownload={() => downloadFile(a)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Internal-only files */}
          {internalOnly.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Internal only ({internalOnly.length})
                </p>
              </div>
              <div className="space-y-1.5">
                {internalOnly.map(a => (
                  <AttachmentRow
                    key={a.id}
                    attachment={a}
                    readOnly={readOnly}
                    onToggle={() => toggleVisibility(a.id, a.is_client_visible)}
                    onDelete={() => deleteAttachment(a)}
                    onDownload={() => downloadFile(a)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Attachment Row ────────────────────────────────────────────────────────────
function AttachmentRow({ attachment: a, readOnly, onToggle, onDelete, onDownload }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
      a.is_client_visible
        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
    }`}>
      <FileIcon type={a.file_type} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{a.file_name}</p>
        <p className="text-xs text-slate-400">
          {fmtSize(a.file_size)} · {fmtDate(a.created_at)}
          {a.uploaded_by && ` · ${a.uploaded_by}`}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Visibility toggle */}
        {!readOnly && (
          <button
            onClick={onToggle}
            title={a.is_client_visible ? 'Make internal only' : 'Make visible to client'}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              a.is_client_visible
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {a.is_client_visible
              ? <><Globe className="w-3 h-3" /> Client</>
              : <><Lock className="w-3 h-3" /> Internal</>
            }
          </button>
        )}

        {/* Download */}
        <button
          onClick={onDownload}
          title="Download"
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        {!readOnly && (
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}