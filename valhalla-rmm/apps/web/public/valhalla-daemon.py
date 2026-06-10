#!/usr/bin/env python3
"""
Valhalla IT Remote Access Daemon v1.0
Runs persistently on client devices. Enables browser-based remote terminal
via Supabase Realtime. Install with: sudo python3 valhalla-daemon.py --install
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# ── Constants — defined first so everything below can use them ────────────────
AGENT_DIR   = Path('/usr/local/valhalla-it')
VENV_DIR    = AGENT_DIR / 'venv'
CONFIG_FILE = AGENT_DIR / 'daemon.conf'
LOG_FILE    = AGENT_DIR / 'daemon.log'
VERSION     = '1.0.0'

# ── Venv bootstrap — creates venv, installs deps, re-execs if needed ─────────
def ensure_venv():
    venv_python = VENV_DIR / 'bin' / 'python3'
    # Already running inside the venv? Nothing to do.
    if str(VENV_DIR) in sys.executable:
        return
    # Create venv if missing
    if not venv_python.exists():
        AGENT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Creating virtualenv at {VENV_DIR} ...")
        subprocess.check_call([sys.executable, '-m', 'venv', str(VENV_DIR)])
    # Install deps
    venv_pip = VENV_DIR / 'bin' / 'pip'
    print("Installing dependencies ...")
    subprocess.check_call([str(venv_pip), 'install', 'websockets', 'aiohttp', '-q'])
    # Re-exec with venv Python
    print("Restarting with venv Python ...")
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)

ensure_venv()

# ── Imports — safe after venv bootstrap ──────────────────────────────────────
import asyncio
import json
import logging
import pty
import select
import signal
import struct
import time
import fcntl
import termios

import websockets
import aiohttp


# ── Config ────────────────────────────────────────────────────────────────────
def load_config() -> dict:
    if not CONFIG_FILE.exists():
        sys.exit(f"Config not found: {CONFIG_FILE}\nRun the agent install script first.")
    cfg = {}
    for line in CONFIG_FILE.read_text().splitlines():
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            cfg[k.strip()] = v.strip()
    required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DEVICE_ID', 'AGENT_API_KEY']
    missing  = [k for k in required if not cfg.get(k)]
    if missing:
        sys.exit(f"Missing config keys: {', '.join(missing)}")
    return cfg


def setup_logging():
    AGENT_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler(sys.stdout),
        ]
    )


# ── PTY session ───────────────────────────────────────────────────────────────
class PtySession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.pid = None
        self.fd  = None
        self.active = False

    def start(self):
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.environ.update({'TERM': 'xterm-256color', 'COLORTERM': 'truecolor'})
            shell = os.environ.get('SHELL', '/bin/bash')
            os.execvp(shell, [shell, '--login'])
        self.active = True
        logging.info(f"Session {self.session_id}: PTY started (pid={self.pid})")

    def write(self, data: str):
        if self.active and self.fd is not None:
            try:
                os.write(self.fd, data.encode('utf-8'))
            except OSError as e:
                logging.warning(f"PTY write: {e}")

    def resize(self, rows: int, cols: int):
        if self.fd is not None:
            try:
                ws = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.fd, termios.TIOCSWINSZ, ws)
            except OSError:
                pass

    def stop(self):
        self.active = False
        if self.pid:
            try: os.kill(self.pid, signal.SIGTERM)
            except OSError: pass
        if self.fd is not None:
            try: os.close(self.fd)
            except OSError: pass
        logging.info(f"Session {self.session_id}: stopped")


# ── Supabase Realtime (Phoenix Channels over WebSocket) ───────────────────────
class RealtimeClient:
    def __init__(self, supabase_url: str, anon_key: str):
        ws_base      = supabase_url.replace('https://', 'wss://').replace('http://', 'ws://')
        self.ws_url  = f"{ws_base}/realtime/v1/websocket?apikey={anon_key}&vsn=1.0.0"
        self.anon_key   = anon_key
        self.ws         = None
        self._ref       = 0
        self._joined    = set()
        self._callbacks = {}

    def _next_ref(self) -> str:
        self._ref += 1
        return str(self._ref)

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, ping_interval=20, ping_timeout=10)
        logging.info("Realtime: connected")

    async def _send(self, msg: dict):
        if self.ws:
            await self.ws.send(json.dumps(msg))

    async def join(self, topic: str):
        full = f"realtime:{topic}"
        if full in self._joined:
            return
        await self._send({
            "topic": full,
            "event": "phx_join",
            "payload": {
                "config": {"broadcast": {"ack": False, "self": False}},
                "access_token": self.anon_key,
            },
            "ref": self._next_ref(),
        })
        self._joined.add(full)

    async def broadcast(self, topic: str, event: str, payload: dict):
        await self._send({
            "topic":   f"realtime:{topic}",
            "event":   "broadcast",
            "payload": {"type": "broadcast", "event": event, "payload": payload},
            "ref":     self._next_ref(),
        })

    def on(self, topic: str, event: str, callback):
        key = f"realtime:{topic}"
        self._callbacks.setdefault(key, {}).setdefault(event, []).append(callback)

    async def _heartbeat(self):
        while True:
            await asyncio.sleep(25)
            try:
                await self._send({
                    "topic": "phoenix", "event": "heartbeat",
                    "payload": {}, "ref": self._next_ref()
                })
            except Exception:
                break

    async def listen(self):
        asyncio.create_task(self._heartbeat())
        async for raw in self.ws:
            try:
                msg     = json.loads(raw)
                topic   = msg.get('topic', '')
                event   = msg.get('event', '')
                payload = msg.get('payload', {})
                if event == 'broadcast':
                    inner_event   = payload.get('event', '')
                    inner_payload = payload.get('payload', {})
                    for cb in self._callbacks.get(topic, {}).get(inner_event, []):
                        asyncio.create_task(cb(inner_payload))
            except Exception as e:
                logging.warning(f"Message parse: {e}")


# ── Main daemon ───────────────────────────────────────────────────────────────
class ValhallaDeamon:
    def __init__(self, cfg: dict):
        self.supabase_url  = cfg['SUPABASE_URL']
        self.anon_key      = cfg['SUPABASE_ANON_KEY']
        self.device_id     = cfg['DEVICE_ID']
        self.agent_api_key = cfg['AGENT_API_KEY']
        self.verify_url    = f"{self.supabase_url}/functions/v1/verify-session"
        self.sessions      = {}
        self.rt            = None

    async def verify_session(self, session_id: str, session_token: str) -> bool:
        """Call the verify-session edge function. Includes Authorization header."""
        try:
            async with aiohttp.ClientSession() as http:
                resp = await http.post(
                    self.verify_url,
                    json={
                        'session_id':    session_id,
                        'session_token': session_token,
                        'agent_api_key': self.agent_api_key,
                    },
                    headers={
                        'Content-Type':  'application/json',
                        'Authorization': 'Bearer ' + self.anon_key,
                    },
                    timeout=aiohttp.ClientTimeout(total=10),
                )
                data = await resp.json()
                logging.info(f"verify-session response ({resp.status}): {data}")
                return data.get('ok') is True
        except Exception as e:
            logging.error(f"verify_session error: {e}")
            return False

    async def close_session_db(self, session_id: str):
        try:
            rest = f"{self.supabase_url}/rest/v1/remote_sessions?id=eq.{session_id}"
            async with aiohttp.ClientSession() as http:
                await http.patch(
                    rest,
                    json={'status': 'closed', 'closed_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
                    headers={
                        'apikey':        self.anon_key,
                        'Authorization': 'Bearer ' + self.anon_key,
                        'Content-Type':  'application/json',
                    },
                    timeout=aiohttp.ClientTimeout(total=5),
                )
        except Exception as e:
            logging.warning(f"close_session_db: {e}")

    async def on_start(self, payload: dict):
        session_id    = payload.get('session_id', '')
        session_token = payload.get('session_token', '')
        if not session_id or not session_token:
            return
        if session_id in self.sessions:
            return

        logging.info(f"Session {session_id}: start request received")

        if not await self.verify_session(session_id, session_token):
            logging.warning(f"Session {session_id}: verification failed — rejected")
            return

        session_ch = f"session-{session_id}"
        await self.rt.join(session_ch)

        async def on_input(p):
            s = self.sessions.get(session_id)
            if s:
                s.write(p.get('data', ''))

        async def on_resize(p):
            s = self.sessions.get(session_id)
            if s:
                s.resize(int(p.get('rows', 24)), int(p.get('cols', 80)))

        async def on_close(p):
            await self.stop_session(session_id)

        self.rt.on(session_ch, 'input',  on_input)
        self.rt.on(session_ch, 'resize', on_resize)
        self.rt.on(session_ch, 'close',  on_close)

        session = PtySession(session_id)
        session.start()
        self.sessions[session_id] = session

        ctrl = f"device-control-{self.device_id}"
        await self.rt.broadcast(ctrl, 'session_ready', {'session_id': session_id})

        asyncio.create_task(self.stream_output(session_id, session_ch))

    async def stream_output(self, session_id: str, channel: str):
        session = self.sessions.get(session_id)
        if not session:
            return
        loop = asyncio.get_event_loop()
        while session.active:
            try:
                r, _, _ = await loop.run_in_executor(
                    None, lambda: select.select([session.fd], [], [], 0.05)
                )
                if r:
                    data = await loop.run_in_executor(
                        None, lambda: os.read(session.fd, 4096)
                    )
                    if data:
                        await self.rt.broadcast(channel, 'output', {
                            'data': data.decode('utf-8', errors='replace')
                        })
                else:
                    try:
                        pid, _ = os.waitpid(session.pid, os.WNOHANG)
                        if pid != 0:
                            break
                    except ChildProcessError:
                        break
            except OSError:
                break
            except Exception as e:
                logging.error(f"Stream error: {e}")
                await asyncio.sleep(0.1)

        await self.rt.broadcast(channel, 'exit', {'session_id': session_id})
        await self.stop_session(session_id)

    async def stop_session(self, session_id: str):
        s = self.sessions.pop(session_id, None)
        if s:
            s.stop()
        await self.close_session_db(session_id)

    async def run(self):
        setup_logging()
        logging.info(f"Valhalla IT Remote Access Daemon v{VERSION}")
        logging.info(f"Device ID: {self.device_id}")

        delay = 5
        while True:
            try:
                self.rt = RealtimeClient(self.supabase_url, self.anon_key)
                await self.rt.connect()

                ctrl = f"device-control-{self.device_id}"
                await self.rt.join(ctrl)
                self.rt.on(ctrl, 'start', self.on_start)
                self.rt.on(ctrl, 'stop',  lambda p: asyncio.create_task(
                    self.stop_session(p.get('session_id', ''))
                ))

                logging.info(f"Listening on: {ctrl}")
                delay = 5
                await self.rt.listen()

            except Exception as e:
                logging.error(f"Connection lost: {e} — retrying in {delay}s")
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)


# ── Service install / uninstall ───────────────────────────────────────────────
def install_service(daemon_path: str):
    import platform
    venv_python = str(VENV_DIR / 'bin' / 'python3')

    if platform.system() == 'Linux':
        svc = Path('/etc/systemd/system/valhalla-daemon.service')
        svc.write_text(f"""[Unit]
Description=Valhalla IT Remote Access Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart={venv_python} {daemon_path}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
""")
        os.system('systemctl daemon-reload')
        os.system('systemctl enable valhalla-daemon')
        os.system('systemctl start valhalla-daemon')
        print("Service installed and started.")
        print("  Status: systemctl status valhalla-daemon")
        print("  Logs:   journalctl -u valhalla-daemon -f")

    elif platform.system() == 'Darwin':
        plist_path = Path('/Library/LaunchDaemons/com.valhallait.daemon.plist')
        plist_path.write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.valhallait.daemon</string>
    <key>ProgramArguments</key><array>
        <string>{venv_python}</string>
        <string>{daemon_path}</string>
    </array>
    <key>KeepAlive</key><true/>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>{LOG_FILE}</string>
    <key>StandardErrorPath</key><string>{LOG_FILE}</string>
</dict></plist>""")
        os.system(f'launchctl load {plist_path}')
        print("LaunchDaemon installed and started.")


def uninstall_service():
    import platform
    if platform.system() == 'Linux':
        os.system('systemctl stop valhalla-daemon 2>/dev/null')
        os.system('systemctl disable valhalla-daemon 2>/dev/null')
        Path('/etc/systemd/system/valhalla-daemon.service').unlink(missing_ok=True)
        os.system('systemctl daemon-reload')
    elif platform.system() == 'Darwin':
        p = Path('/Library/LaunchDaemons/com.valhallait.daemon.plist')
        if p.exists():
            os.system(f'launchctl unload {p}')
            p.unlink()
    print("Daemon removed.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if '--install' in sys.argv:
        AGENT_DIR.mkdir(parents=True, exist_ok=True)
        dest = AGENT_DIR / 'valhalla-daemon.py'
        shutil.copy(__file__, dest)
        dest.chmod(0o755)
        install_service(str(dest))
    elif '--uninstall' in sys.argv:
        uninstall_service()
    else:
        cfg    = load_config()
        daemon = ValhallaDeamon(cfg)
        asyncio.run(daemon.run())
