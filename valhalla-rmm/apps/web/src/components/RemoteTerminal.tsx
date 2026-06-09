// @ts-nocheck
// apps/web/src/components/RemoteTerminal.tsx

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  Terminal, X, Maximize2, Minimize2,
  Loader2, AlertTriangle, RefreshCw, Wifi, WifiOff,
} from 'lucide-react'

type Status = 'idle' | 'connecting' | 'waiting' | 'active' | 'error' | 'closed'

export default function RemoteTerminal({ deviceId, deviceHostname, orgId }) {
  const supabase = createSupabaseBrowserClient()

  // xterm container is ALWAYS in the DOM so it always has real dimensions
  const termRef      = useRef(null)
  const xtermRef     = useRef(null)
  const fitRef       = useRef(null)
  const ctrlChRef    = useRef(null)
  const sessChRef    = useRef(null)
  const sessionRef   = useRef(null)

  const [status,     setStatus]     = useState<Status>('idle')
  const [error,      setError]      = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // ── Init xterm once on mount — container always in DOM ───────────────────
  useEffect(() => {
    if (!termRef.current || xtermRef.current) return

    const term = new XTerm({
      cursorBlink:   true,
      fontSize:      13,
      fontFamily:    '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
      scrollback:    5000,
      convertEol:    true,
      theme: {
        background:          '#0f172a',
        foreground:          '#e2e8f0',
        cursor:              '#f59e0b',
        selectionBackground: 'rgba(245,158,11,0.25)',
        black:   '#1e293b', red:     '#f87171', green:   '#4ade80', yellow:  '#facc15',
        blue:    '#60a5fa', magenta: '#c084fc', cyan:    '#22d3ee', white:   '#e2e8f0',
        brightBlack: '#475569', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f8fafc',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)

    // Slight delay so the container has finished painting
    setTimeout(() => { try { fit.fit() } catch {} }, 50)

    xtermRef.current = term
    fitRef.current   = fit

    // Keyboard input → session channel
    term.onData((data) => {
      sessChRef.current?.send({ type: 'broadcast', event: 'input', payload: { data } })
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit()
        sessChRef.current?.send({
          type: 'broadcast', event: 'resize',
          payload: { rows: term.rows, cols: term.cols },
        })
      } catch {}
    })
    ro.observe(termRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      xtermRef.current = null
      fitRef.current   = null
    }
  }, [])                                         // runs once on mount

  // ── Cleanup channels ───────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (ctrlChRef.current) { supabase.removeChannel(ctrlChRef.current); ctrlChRef.current = null }
    if (sessChRef.current) { supabase.removeChannel(sessChRef.current); sessChRef.current = null }
    sessionRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // ── Refit on fullscreen toggle ─────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => { try { fitRef.current?.fit() } catch {} }, 100)
  }, [fullscreen])

  // ── Connect session channel once session is active ─────────────────────────
  const connectSession = useCallback((sid: string) => {
    const term = xtermRef.current
    if (!term) return

    // Clear any previous content and show cursor
    term.clear()
    term.focus()

    const sessionTopic = `session-${sid}`
    const ch           = supabase.channel(sessionTopic)

    ch.on('broadcast', { event: 'output' }, ({ payload }) => {
      term.write(payload?.data ?? '')
    })

    ch.on('broadcast', { event: 'exit' }, () => {
      term.writeln('\r\n\x1b[33m[Session ended by device]\x1b[0m')
      setStatus('closed')
    })

    ch.subscribe(() => {
      // Resize + carriage return to trigger shell prompt redraw
      setTimeout(() => {
        try { fitRef.current?.fit() } catch {}
        ch.send({ type: 'broadcast', event: 'resize', payload: { rows: term.rows, cols: term.cols } })
        ch.send({ type: 'broadcast', event: 'input',  payload: { data: '\r' } })
        term.focus()
      }, 200)
    })

    sessChRef.current  = ch
    sessionRef.current = sid
  }, [])

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: session, error: sessionErr } = await supabase
      .from('remote_sessions')
      .insert({
        organization_id: orgId,
        device_id:       deviceId,
        device_hostname: deviceHostname,
        created_by:      user?.email ?? '',
        status:          'pending',
      })
      .select('id, session_token')
      .single()

    if (sessionErr || !session) {
      setStatus('error')
      setError('Failed to create session: ' + (sessionErr?.message ?? 'unknown'))
      return
    }

    const sessionId    = session.id
    const sessionToken = session.session_token

    const ctrl = supabase.channel(`device-control-${deviceId}`)

    ctrl.on('broadcast', { event: 'session_ready' }, ({ payload }) => {
      if (payload?.session_id === sessionId) {
        setStatus('active')
        connectSession(sessionId)
      }
    })

    ctrl.subscribe(async () => {
      await ctrl.send({
        type: 'broadcast', event: 'start',
        payload: { session_id: sessionId, session_token: sessionToken },
      })
    })

    ctrlChRef.current = ctrl
    setStatus('waiting')

    setTimeout(() => {
      setStatus(prev => {
        if (prev === 'waiting') {
          setError('Device did not respond. Make sure the Valhalla daemon is running.')
          return 'error'
        }
        return prev
      })
    }, 30000)
  }, [deviceId, deviceHostname, orgId, connectSession])

  // ── Close session ──────────────────────────────────────────────────────────
  const closeSession = useCallback(async () => {
    const sid = sessionRef.current
    if (sid) {
      ctrlChRef.current?.send({ type: 'broadcast', event: 'stop', payload: { session_id: sid } })
      await supabase.from('remote_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sid)
    }
    cleanup()
    xtermRef.current?.clear()
    setStatus('idle')
  }, [cleanup])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col rounded-2xl border border-slate-800 overflow-hidden bg-slate-950 ${fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
         style={{ height: fullscreen ? '100vh' : '520px' }}>

      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500" onClick={status === 'active' ? closeSession : undefined} style={{ cursor: status === 'active' ? 'pointer' : 'default' }} />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <Terminal className="w-3.5 h-3.5 text-slate-500 ml-2" />
        <span className="text-xs text-slate-400 font-mono flex-1 truncate">
          {status === 'idle'       && `${deviceHostname} — not connected`}
          {status === 'connecting' && 'Creating session…'}
          {status === 'waiting'    && `Waiting for ${deviceHostname}…`}
          {status === 'active'     && `${deviceHostname}`}
          {status === 'error'      && 'Connection failed'}
          {status === 'closed'     && 'Session ended'}
        </span>
        {(status === 'connecting' || status === 'waiting') && (
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
        )}
        {status === 'active' && (
          <div className="flex items-center gap-1 text-emerald-400 flex-shrink-0">
            <Wifi className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">LIVE</span>
          </div>
        )}
        <button onClick={() => setFullscreen(p => !p)} className="p-1 rounded hover:bg-slate-800 text-slate-500 transition-colors">
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        {(status === 'active' || status === 'waiting') && (
          <button onClick={closeSession} className="p-1 rounded hover:bg-slate-800 text-slate-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Terminal area — always in DOM at full size */}
      <div className="flex-1 relative overflow-hidden">

        {/* xterm.js container — always present, always sized */}
        <div
          ref={termRef}
          onClick={() => xtermRef.current?.focus()}
          className="absolute inset-0"
          style={{ padding: '4px' }}
        />

        {/* Overlay shown when terminal is not the active state */}
        {status !== 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 z-10 p-8">
            {status === 'idle' && (<>
              <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
                <Terminal className="w-7 h-7 text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 font-semibold">Remote Terminal</p>
                <p className="text-slate-500 text-sm mt-1">Start a shell session on <span className="font-mono text-slate-400">{deviceHostname}</span></p>
                <p className="text-slate-600 text-xs mt-2">Requires the Valhalla daemon running on the device</p>
              </div>
              <button onClick={startSession}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
                <Terminal className="w-4 h-4" /> Start Remote Session
              </button>
            </>)}

            {(status === 'connecting' || status === 'waiting') && (<>
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-slate-300 text-sm font-medium">
                {status === 'connecting' ? 'Creating session…' : `Waiting for ${deviceHostname}…`}
              </p>
            </>)}

            {status === 'error' && (<>
              <div className="w-12 h-12 rounded-xl bg-rose-950/40 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div className="text-center">
                <p className="text-rose-300 font-semibold">Connection Failed</p>
                {error && <p className="text-slate-500 text-xs mt-2 max-w-sm">{error}</p>}
              </div>
              <button onClick={() => { cleanup(); setStatus('idle') }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-300 text-sm transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </button>
            </>)}

            {status === 'closed' && (<>
              <WifiOff className="w-8 h-8 text-slate-600" />
              <p className="text-slate-400 text-sm">Session ended</p>
              <button onClick={() => { cleanup(); setStatus('idle') }}
                className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-300 text-sm transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> New Session
              </button>
            </>)}
          </div>
        )}
      </div>
    </div>
  )
}
