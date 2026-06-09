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

  const termContainerRef = useRef(null)   // the DOM div xterm attaches to
  const xtermRef         = useRef(null)
  const fitRef           = useRef(null)
  const ctrlChRef        = useRef(null)
  const sessChRef        = useRef(null)
  const sessionIdRef     = useRef(null)
  const pendingSidRef    = useRef(null)   // holds session ID waiting for DOM to be visible

  const [status,     setStatus]     = useState<Status>('idle')
  const [error,      setError]      = useState(null)
  const [fullscreen, setFullscreen] = useState(false)

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (ctrlChRef.current) { supabase.removeChannel(ctrlChRef.current); ctrlChRef.current = null }
    if (sessChRef.current) { supabase.removeChannel(sessChRef.current); sessChRef.current = null }
    if (xtermRef.current)  { try { xtermRef.current.dispose() } catch {}; xtermRef.current = null }
    fitRef.current     = null
    sessionIdRef.current  = null
    pendingSidRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // ── Init xterm AFTER the container div becomes visible ────────────────────
  // This useEffect fires every time status changes. When status becomes 'active'
  // and there is a pendingSidRef, the DOM div is now visible so xterm can open.
  useEffect(() => {
    if (status !== 'active') return
    const sid = pendingSidRef.current
    if (!sid) return
    if (xtermRef.current) return  // already initialized
    if (!termContainerRef.current) return

    pendingSidRef.current = null

    // Small RAF to ensure the browser has painted the visible div
    requestAnimationFrame(() => {
      if (!termContainerRef.current) return

      const term = new XTerm({
        cursorBlink:    true,
        fontSize:       13,
        fontFamily:     '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
        scrollback:     5000,
        theme: {
          background:      '#0f172a',
          foreground:      '#e2e8f0',
          cursor:          '#f59e0b',
          selectionBackground: 'rgba(245,158,11,0.3)',
          black:   '#1e293b', red:     '#f87171', green:   '#4ade80', yellow:  '#facc15',
          blue:    '#60a5fa', magenta: '#c084fc', cyan:    '#22d3ee', white:   '#e2e8f0',
          brightBlack: '#475569', brightRed: '#fca5a5', brightGreen: '#86efac',
          brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9', brightWhite: '#f8fafc',
        },
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(termContainerRef.current)

      // Fit must run after open
      requestAnimationFrame(() => {
        try { fit.fit() } catch {}
      })

      xtermRef.current = term
      fitRef.current   = fit

      // Focus so keystrokes work immediately
      term.focus()

      // Subscribe to session I/O channel
      const sessionTopic   = `session-${sid}`
      const sessionChannel = supabase.channel(sessionTopic)

      // Receive terminal output from device
      sessionChannel.on('broadcast', { event: 'output' }, ({ payload }) => {
        term.write(payload?.data ?? '')
      })

      // Device closed session
      sessionChannel.on('broadcast', { event: 'exit' }, () => {
        term.writeln('\r\n\x1b[33m[Session ended]\x1b[0m')
        setStatus('closed')
      })

      sessionChannel.subscribe(() => {
        // Channel ready — send resize + carriage return to trigger prompt
        requestAnimationFrame(() => {
          try { fit.fit() } catch {}
          sessionChannel.send({
            type: 'broadcast', event: 'resize',
            payload: { rows: term.rows, cols: term.cols },
          })
          // Carriage return forces shell to redraw the prompt
          sessionChannel.send({
            type: 'broadcast', event: 'input',
            payload: { data: '\r' },
          })
        })
      })

      sessChRef.current = sessionChannel
      sessionIdRef.current = sid

      // Send keyboard input to device
      term.onData((data) => {
        sessChRef.current?.send({
          type: 'broadcast', event: 'input', payload: { data },
        })
      })

      // Auto-resize on container resize
      const ro = new ResizeObserver(() => {
        try {
          fitRef.current?.fit()
          sessChRef.current?.send({
            type: 'broadcast', event: 'resize',
            payload: { rows: term.rows, cols: term.cols },
          })
        } catch {}
      })
      ro.observe(termContainerRef.current)
    })
  }, [status])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: session, error: err } = await supabase
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

    if (err || !session) {
      setStatus('error')
      setError('Failed to create session: ' + (err?.message ?? 'unknown'))
      return
    }

    const sessionId    = session.id
    const sessionToken = session.session_token

    // Subscribe to device control channel
    const controlTopic = `device-control-${deviceId}`
    const ctrl         = supabase.channel(controlTopic)

    // When device confirms session is ready, store the ID and flip status.
    // The useEffect above will initialize xterm once the DOM re-renders.
    ctrl.on('broadcast', { event: 'session_ready' }, ({ payload }) => {
      if (payload?.session_id === sessionId) {
        pendingSidRef.current = sessionId   // tell the useEffect which session to open
        setStatus('active')                 // triggers re-render → useEffect fires
      }
    })

    ctrl.subscribe(async () => {
      // Channel ready — signal the device
      await ctrl.send({
        type: 'broadcast', event: 'start',
        payload: { session_id: sessionId, session_token: sessionToken },
      })
    })

    ctrlChRef.current = ctrl
    setStatus('waiting')

    // Timeout if device doesn't respond
    setTimeout(() => {
      if (pendingSidRef.current === sessionId || status === 'waiting') {
        setStatus('error')
        setError('Device did not respond in 30 seconds. Make sure the Valhalla daemon is running.')
      }
    }, 30000)
  }, [deviceId, deviceHostname, orgId])

  // ── Close session ──────────────────────────────────────────────────────────
  const closeSession = useCallback(async () => {
    const sid = sessionIdRef.current
    if (sid) {
      ctrlChRef.current?.send({
        type: 'broadcast', event: 'stop', payload: { session_id: sid },
      })
      await supabase.from('remote_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sid)
    }
    cleanup()
    setStatus('idle')
  }, [cleanup])

  // Refit on fullscreen toggle
  useEffect(() => {
    if (fitRef.current) requestAnimationFrame(() => { try { fitRef.current.fit() } catch {} })
  }, [fullscreen])

  // ── Render ─────────────────────────────────────────────────────────────────
  const containerCls = `flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950 ${fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`

  return (
    <div className={containerCls}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500 cursor-pointer" onClick={status === 'active' ? closeSession : undefined} />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <Terminal className="w-3.5 h-3.5 text-slate-500 ml-2" />
        <span className="text-xs text-slate-400 font-mono flex-1 truncate">
          {status === 'idle'        && `${deviceHostname} — not connected`}
          {status === 'connecting'  && 'Creating session…'}
          {status === 'waiting'     && `Waiting for ${deviceHostname}…`}
          {status === 'active'      && `${deviceHostname}`}
          {status === 'error'       && 'Connection failed'}
          {status === 'closed'      && 'Session ended'}
        </span>
        {(status === 'connecting' || status === 'waiting') && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />}
        {status === 'active' && (
          <div className="flex items-center gap-1 text-emerald-400 flex-shrink-0">
            <Wifi className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase">Live</span>
          </div>
        )}
        <button onClick={() => setFullscreen(p => !p)} className="p-1 rounded hover:bg-slate-800 text-slate-500">
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        {(status === 'active' || status === 'waiting') && (
          <button onClick={closeSession} className="p-1 rounded hover:bg-slate-800 text-slate-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 relative" style={{ minHeight: '420px' }}>

        {/* xterm container — always in DOM but hidden until active */}
        <div
          ref={termContainerRef}
          onClick={() => xtermRef.current?.focus()}
          className="absolute inset-0 p-0"
          style={{ display: status === 'active' ? 'block' : 'none' }}
        />

        {/* Overlay states */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
              <Terminal className="w-7 h-7 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-300 font-semibold">Remote Terminal</p>
              <p className="text-slate-500 text-sm mt-1">
                Start a shell session on <span className="text-slate-400 font-mono">{deviceHostname}</span>
              </p>
              <p className="text-slate-600 text-xs mt-2">Requires the Valhalla daemon running on the device</p>
            </div>
            <button onClick={startSession}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
              <Terminal className="w-4 h-4" /> Start Remote Session
            </button>
          </div>
        )}

        {(status === 'connecting' || status === 'waiting') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-slate-300 text-sm font-medium">
              {status === 'connecting' ? 'Creating session…' : `Waiting for ${deviceHostname} to respond…`}
            </p>
            {status === 'waiting' && <p className="text-slate-500 text-xs max-w-xs text-center">Usually takes 1–3 seconds</p>}
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
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
          </div>
        )}

        {status === 'closed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <WifiOff className="w-8 h-8 text-slate-600" />
            <p className="text-slate-400 text-sm">Session ended</p>
            <button onClick={() => { cleanup(); setStatus('idle') }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-300 text-sm transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> New Session
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
