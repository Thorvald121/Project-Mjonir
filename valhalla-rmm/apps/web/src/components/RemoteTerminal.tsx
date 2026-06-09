// @ts-nocheck
// apps/web/src/components/RemoteTerminal.tsx
//
// xterm.js terminal component connected to Supabase Realtime.
// Renders an interactive shell for the device the admin selects.

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

type SessionStatus = 'idle' | 'connecting' | 'waiting_for_device' | 'active' | 'error' | 'closed'

interface Props {
  deviceId:       string
  deviceHostname: string
  orgId:          string
}

export default function RemoteTerminal({ deviceId, deviceHostname, orgId }: Props) {
  const supabase      = createSupabaseBrowserClient()
  const termRef       = useRef<HTMLDivElement>(null)
  const xtermRef      = useRef<XTerm | null>(null)
  const fitRef        = useRef<FitAddon | null>(null)
  const channelRef    = useRef<any>(null)
  const ctrlChannelRef = useRef<any>(null)
  const sessionIdRef  = useRef<string | null>(null)

  const [status,      setStatus]      = useState<SessionStatus>('idle')
  const [error,       setError]       = useState<string | null>(null)
  const [fullscreen,  setFullscreen]  = useState(false)
  const [mounted,     setMounted]     = useState(false)

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (ctrlChannelRef.current) {
      supabase.removeChannel(ctrlChannelRef.current)
      ctrlChannelRef.current = null
    }
    if (xtermRef.current) {
      xtermRef.current.dispose()
      xtermRef.current = null
    }
    sessionIdRef.current = null
  }, [])

  useEffect(() => {
    setMounted(true)
    return cleanup
  }, [cleanup])

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)

    // Create session in database
    const { data: { user } } = await supabase.auth.getUser()
    const { data: session, error: sessionErr } = await supabase
      .from('remote_sessions')
      .insert({
        organization_id: orgId,
        device_id:       deviceId,
        device_hostname: deviceHostname,
        created_by:      user?.email ?? 'unknown',
        status:          'pending',
      })
      .select('id, session_token')
      .single()

    if (sessionErr || !session) {
      setStatus('error')
      setError('Failed to create session: ' + (sessionErr?.message ?? 'Unknown error'))
      return
    }

    const sessionId    = session.id
    const sessionToken = session.session_token
    sessionIdRef.current = sessionId

    // ── Subscribe to device control channel (to receive session_ready) ──────
    const controlTopic = `device-control-${deviceId}`
    const ctrlChannel  = supabase.channel(controlTopic)

    ctrlChannel.on('broadcast', { event: 'session_ready' }, ({ payload }) => {
      if (payload?.session_id === sessionId) {
        setStatus('active')
        connectTerminal(sessionId)
      }
    })

    ctrlChannel.subscribe()
    ctrlChannelRef.current = ctrlChannel

    // ── Signal the device to start ───────────────────────────────────────────
    await ctrlChannel.send({
      type:    'broadcast',
      event:   'start',
      payload: { session_id: sessionId, session_token: sessionToken },
    })

    setStatus('waiting_for_device')

    // Timeout if device doesn't respond in 30 seconds
    setTimeout(() => {
      if (sessionIdRef.current === sessionId && status !== 'active') {
        setStatus('error')
        setError('Device did not respond. Make sure the Valhalla daemon is running on the device.')
      }
    }, 30000)
  }, [deviceId, deviceHostname, orgId])

  // ── Connect xterm.js to the session channel ────────────────────────────────
  const connectTerminal = useCallback((sessionId: string) => {
    if (!termRef.current || !mounted) return

    // Init xterm
    const term = new XTerm({
      cursorBlink:     true,
      fontSize:        13,
      fontFamily:      '"JetBrains Mono", "Cascadia Code", "Fira Code", Menlo, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor:     '#f59e0b',
        black:      '#1e293b', red:     '#f87171', green:   '#4ade80', yellow:  '#facc15',
        blue:       '#60a5fa', magenta: '#c084fc', cyan:    '#22d3ee', white:   '#e2e8f0',
        brightBlack: '#475569', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047',
        brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#f8fafc',
      },
      allowTransparency: false,
      scrollback:        5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current)
    fit.fit()

    xtermRef.current = term
    fitRef.current   = fit

    // Send keyboard input to device
    term.onData((data) => {
      sessionChannel?.send({
        type:    'broadcast',
        event:   'input',
        payload: { data },
      })
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit()
        sessionChannel?.send({
          type:    'broadcast',
          event:   'resize',
          payload: { rows: term.rows, cols: term.cols },
        })
      } catch {}
    })
    if (termRef.current) resizeObserver.observe(termRef.current)

    // ── Subscribe to session I/O channel ─────────────────────────────────────
    const sessionTopic   = `session-${sessionId}`
    const sessionChannel = supabase.channel(sessionTopic)

    sessionChannel.on('broadcast', { event: 'output' }, ({ payload }) => {
      term.write(payload?.data ?? '')
    })

    sessionChannel.on('broadcast', { event: 'exit' }, () => {
      term.writeln('\r\n\x1b[33m[Session ended by device]\x1b[0m')
      setStatus('closed')
    })

    sessionChannel.subscribe(() => {
      // Send initial resize once subscribed
      setTimeout(() => {
        fit.fit()
        sessionChannel.send({
          type:    'broadcast',
          event:   'resize',
          payload: { rows: term.rows, cols: term.cols },
        })
      }, 200)
    })

    channelRef.current = sessionChannel
  }, [mounted])

  // ── Close session ──────────────────────────────────────────────────────────
  const closeSession = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (sessionId && ctrlChannelRef.current) {
      await ctrlChannelRef.current.send({
        type:    'broadcast',
        event:   'stop',
        payload: { session_id: sessionId },
      })
      // Mark closed in DB
      await supabase
        .from('remote_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
    cleanup()
    setStatus('idle')
  }, [cleanup])

  // ── Toggle fullscreen ──────────────────────────────────────────────────────
  useEffect(() => {
    if (fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 100)
    }
  }, [fullscreen])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950 ${fullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-rose-500" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
        </div>
        <Terminal className="w-3.5 h-3.5 text-slate-500 ml-2" />
        <span className="text-xs text-slate-400 font-mono flex-1">
          {status === 'idle'               && `${deviceHostname} — not connected`}
          {status === 'connecting'         && 'Creating session…'}
          {status === 'waiting_for_device' && `Waiting for ${deviceHostname}…`}
          {status === 'active'             && `${deviceHostname} — connected`}
          {status === 'error'              && 'Connection failed'}
          {status === 'closed'             && 'Session ended'}
        </span>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          {(status === 'connecting' || status === 'waiting_for_device') && (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}
          {status === 'active' && (
            <div className="flex items-center gap-1 text-emerald-400">
              <Wifi className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold">LIVE</span>
            </div>
          )}
          {(status === 'error' || status === 'closed') && (
            <WifiOff className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>

        <button onClick={() => setFullscreen(p => !p)}
          className="p-1 rounded hover:bg-slate-800 text-slate-500 transition-colors">
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        {(status === 'active' || status === 'waiting_for_device') && (
          <button onClick={closeSession}
            className="p-1 rounded hover:bg-slate-800 text-slate-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Terminal / state panels */}
      <div className="flex-1 relative min-h-[400px]">

        {/* Idle state */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
              <Terminal className="w-7 h-7 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-slate-300 font-semibold">Remote Terminal</p>
              <p className="text-slate-500 text-sm mt-1">
                Start a secure shell session on <span className="text-slate-400 font-mono">{deviceHostname}</span>
              </p>
              <p className="text-slate-600 text-xs mt-2">Requires Valhalla daemon running on device</p>
            </div>
            <button onClick={startSession}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
              <Terminal className="w-4 h-4" /> Start Remote Session
            </button>
          </div>
        )}

        {/* Connecting */}
        {(status === 'connecting' || status === 'waiting_for_device') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-slate-300 text-sm font-medium">
              {status === 'connecting' ? 'Creating session…' : `Signaling ${deviceHostname}…`}
            </p>
            {status === 'waiting_for_device' && (
              <p className="text-slate-500 text-xs text-center max-w-xs">
                Waiting for the device daemon to respond. This usually takes 1–3 seconds.
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-12 h-12 rounded-xl bg-rose-950/40 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <div className="text-center">
              <p className="text-rose-300 font-semibold">Connection Failed</p>
              {error && <p className="text-slate-500 text-xs mt-2 max-w-sm">{error}</p>}
            </div>
            <button onClick={() => setStatus('idle')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-300 text-sm transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </button>
          </div>
        )}

        {/* Closed */}
        {status === 'closed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            <p className="text-slate-400 text-sm">Session ended</p>
            <button onClick={() => { cleanup(); setStatus('idle') }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-300 text-sm transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> New Session
            </button>
          </div>
        )}

        {/* xterm.js container — always rendered when active so DOM exists */}
        <div
          ref={termRef}
          className={`w-full h-full p-1 ${status === 'active' ? 'block' : 'hidden'}`}
          style={{ minHeight: '400px' }}
        />
      </div>
    </div>
  )
}
