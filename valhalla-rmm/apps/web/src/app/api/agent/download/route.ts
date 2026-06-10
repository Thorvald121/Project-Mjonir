// @ts-nocheck
// apps/web/src/app/api/agent/download/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function parseSupabaseCookie(raw: string): string | null {
  try {
    let val = decodeURIComponent(raw)
    if (val.startsWith('base64-')) val = Buffer.from(val.slice(7), 'base64').toString('utf-8')
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    if (parsed?.access_token) return parsed.access_token
    return null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const platform     = searchParams.get('platform') || 'linux'
  const customerName = searchParams.get('customer') || ''

  // Serve daemon script without auth
  if (platform === 'daemon') {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/valhalla-daemon.py`)
      if (!r.ok) return new NextResponse('Not found', { status: 404 })
      const text = await r.text()
      return new NextResponse(text, {
        headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="valhalla-daemon.py"' },
      })
    } catch {
      return new NextResponse('Daemon script not found', { status: 404 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cookieStore = cookies()
  let apiKey: string | null = null

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.includes('auth-token')) continue
    const token = parseSupabaseCookie(cookie.value)
    if (!token) continue
    try {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (!user) continue
      const { data: member } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user.id).single()
      if (member?.organization_id) {
        const { data: org } = await supabase
          .from('organizations').select('agent_api_key').eq('id', member.organization_id).single()
        apiKey = org?.agent_api_key ?? null
      }
    } catch { /* try next */ }
    break
  }

  if (!apiKey) return new NextResponse('Unauthorized', { status: 401 })

  const endpoint    = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-device`
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL!

  // ── Linux / macOS bash script ─────────────────────────────────────────────
  if (platform === 'linux' || platform === 'mac') {
    const ramExpr       = '${RAM_GB:-null}'
    const diskExpr      = '${DISK_GB:-null}'
    const diskFreeExpr  = '${DISK_FREE_GB:-null}'
    const logLevelExpr  = '${2:-INFO}'

    const script = `#!/bin/bash
# Valhalla IT Asset Agent — ${platform === 'mac' ? 'macOS' : 'Linux'}
# Pre-configured. Run with --install to set up agent + remote daemon in one step.
#
# Usage:
#   sudo bash valhalla-agent.sh --install     # full install (recommended)
#   sudo bash valhalla-agent.sh --uninstall   # remove everything
#   bash valhalla-agent.sh                    # one-time check-in only

AGENT_VERSION="1.0.0"
API_KEY="${apiKey}"
CUSTOMER_NAME="${customerName}"
SUPABASE_URL="${supabaseUrl}"
SUPABASE_ANON_KEY="${anonKey}"
AGENT_ENDPOINT="${endpoint}"
DAEMON_URL="${appUrl}/api/agent/download?platform=daemon"
AGENT_DIR="/usr/local/valhalla-it"
LOG_FILE="$AGENT_DIR/agent.log"
CONF_FILE="$AGENT_DIR/daemon.conf"
CRON_TAG="# valhalla-it-agent"

DO_INSTALL=false
DO_UNINSTALL=false
for arg in "$@"; do
    case "$arg" in --install) DO_INSTALL=true ;; --uninstall) DO_UNINSTALL=true ;; esac
done

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${logLevelExpr}] $1"
    echo "$msg"
    mkdir -p "$AGENT_DIR"
    echo "$msg" >> "$LOG_FILE"
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
if [[ "$DO_UNINSTALL" == "true" ]]; then
    log "Uninstalling..."
    crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab -
    if [[ "$(uname)" == "Darwin" ]]; then
        for p in /Library/LaunchDaemons/com.valhallait.daemon.plist /Library/LaunchAgents/com.valhallait.agent.plist; do
            [[ -f "$p" ]] && launchctl unload "$p" 2>/dev/null && rm -f "$p"
        done
    else
        systemctl stop valhalla-daemon 2>/dev/null
        systemctl disable valhalla-daemon 2>/dev/null
        rm -f /etc/systemd/system/valhalla-daemon.service
        systemctl daemon-reload 2>/dev/null
    fi
    log "Uninstall complete."
    exit 0
fi

# ── Check-in function ─────────────────────────────────────────────────────────
do_checkin() {
    UNAME="$(uname -s)"
    [[ "$UNAME" == "Darwin" ]] && OS_TYPE="macos" || OS_TYPE="linux"
    HOSTNAME_VAL="$(hostname -s)"

    if [[ "$OS_TYPE" == "macos" ]]; then
        OS_NAME="$(sw_vers -productName) $(sw_vers -productVersion)"
        OS_VERSION="$(sw_vers -productVersion)"
        CPU="$(sysctl -n machdep.cpu.brand_string 2>/dev/null | xargs)"
        RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null)"
        RAM_GB="$(echo "scale=1; $RAM_BYTES / 1073741824" | bc 2>/dev/null)"
        MANUFACTURER="Apple"
        MODEL="$(sysctl -n hw.model 2>/dev/null | xargs)"
        SERIAL="$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial Number/ {print $NF}')"
        DISK_INFO="$(df -k / | tail -1)"
        DISK_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $2}') / 1048576" | bc 2>/dev/null)"
        DISK_FREE_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $4}') / 1048576" | bc 2>/dev/null)"
        PRIMARY_IFACE="$(route get default 2>/dev/null | awk '/interface/ {print $2}' | head -1)"
        IP_ADDRESS="$(ipconfig getifaddr "$PRIMARY_IFACE" 2>/dev/null)"
        MAC_ADDRESS="$(ifconfig "$PRIMARY_IFACE" 2>/dev/null | awk '/ether/ {print $2}' | head -1)"
    else
        OS_NAME="$(cat /etc/os-release 2>/dev/null | awk -F= '/^PRETTY_NAME/{gsub(/"/, "", $2); print $2}')"
        OS_VERSION="$(uname -r)"
        CPU="$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs)"
        RAM_KB="$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')"
        RAM_GB="$(echo "scale=1; $RAM_KB / 1048576" | bc 2>/dev/null)"
        MANUFACTURER="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null | xargs)"
        MODEL="$(cat /sys/class/dmi/id/product_name 2>/dev/null | xargs)"
        SERIAL="$(cat /sys/class/dmi/id/product_serial 2>/dev/null | xargs)"
        DISK_INFO="$(df -k / | tail -1)"
        DISK_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $2}') / 1048576" | bc 2>/dev/null)"
        DISK_FREE_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $4}') / 1048576" | bc 2>/dev/null)"
        IP_ADDRESS="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{print $7}' | head -1)"
        PRIMARY_IFACE="$(ip route get 1.1.1.1 2>/dev/null | awk '/dev/{print $5}' | head -1)"
        MAC_ADDRESS="$(cat /sys/class/net/"$PRIMARY_IFACE"/address 2>/dev/null | xargs)"
    fi

    PAYLOAD='{"api_key":"'"$API_KEY"'","hostname":"'"$HOSTNAME_VAL"'","os":"'"$OS_NAME"'","os_version":"'"$OS_VERSION"'","os_type":"'"$OS_TYPE"'","cpu":"'"$CPU"'","ram_gb":'"${ramExpr}"',"disk_gb":'"${diskExpr}"',"disk_free_gb":'"${diskFreeExpr}"',"ip_address":"'"$IP_ADDRESS"'","mac_address":"'"$MAC_ADDRESS"'","manufacturer":"'"$MANUFACTURER"'","model":"'"$MODEL"'","serial_number":"'"$SERIAL"'","agent_version":"'"$AGENT_VERSION"'","customer_name":"'"$CUSTOMER_NAME"'"}'

    # Use -o to write body to temp file, -w to get HTTP code separately
    # This avoids head -n -1 which is not portable on macOS
    HTTP_CODE="$(curl -sf \\
        -o /tmp/valhalla_resp.json \\
        -w "%{http_code}" \\
        -X POST "$AGENT_ENDPOINT" \\
        -H "Content-Type: application/json" \\
        -d "$PAYLOAD" \\
        --max-time 30 2>/dev/null)"
    BODY="$(cat /tmp/valhalla_resp.json 2>/dev/null)"

    if [[ "$HTTP_CODE" == "200" ]]; then
        log "Check-in successful."
        # Extract device ID — python3 first, fall back to grep
        DEVICE_ID="$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('device_id',''))" 2>/dev/null)"
        if [[ -z "$DEVICE_ID" ]]; then
            DEVICE_ID="$(echo "$BODY" | grep -o '"device_id":"[^"]*"' | cut -d'"' -f4)"
        fi
        if [[ -n "$DEVICE_ID" ]]; then
            mkdir -p "$AGENT_DIR"
            printf 'SUPABASE_URL=%s\\nSUPABASE_ANON_KEY=%s\\nDEVICE_ID=%s\\nAGENT_API_KEY=%s\\n' \\
                "$SUPABASE_URL" "$SUPABASE_ANON_KEY" "$DEVICE_ID" "$API_KEY" > "$CONF_FILE"
            log "Device ID saved: $DEVICE_ID"
        fi
    else
        log "Check-in failed (HTTP $HTTP_CODE): $BODY" "ERROR"
        return 1
    fi
}

# ── Install ───────────────────────────────────────────────────────────────────
if [[ "$DO_INSTALL" == "true" ]]; then
    log "Installing Valhalla IT Agent..."
    mkdir -p "$AGENT_DIR"
    cp "$0" "$AGENT_DIR/valhalla-agent.sh"
    chmod +x "$AGENT_DIR/valhalla-agent.sh"

    if [[ "$(uname)" == "Darwin" ]]; then
        # Use LaunchDaemon (system-wide, runs as root) not LaunchAgent
        PLIST_PATH="/Library/LaunchDaemons/com.valhallait.agent.plist"
        cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.valhallait.agent</string>
    <key>ProgramArguments</key><array>
        <string>/bin/bash</string>
        <string>$AGENT_DIR/valhalla-agent.sh</string>
    </array>
    <key>StartCalendarInterval</key><dict>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>RunAtLoad</key><false/>
    <key>StandardOutPath</key><string>$LOG_FILE</string>
    <key>StandardErrorPath</key><string>$LOG_FILE</string>
</dict></plist>
PLIST
        launchctl bootstrap system "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH" 2>/dev/null
        log "LaunchDaemon installed (runs daily at 8am)."
    else
        (crontab -l 2>/dev/null | grep -v "$CRON_TAG"; echo "0 8 * * * /bin/bash $AGENT_DIR/valhalla-agent.sh $CRON_TAG") | crontab -
        log "Cron job installed."
    fi

    # Register device
    do_checkin

    # Install daemon if config was saved
    if [[ -f "$CONF_FILE" ]]; then
        log "Downloading remote access daemon..."
        DAEMON_PATH="$AGENT_DIR/valhalla-daemon.py"
        if curl -sf -o "$DAEMON_PATH" "$DAEMON_URL" 2>/dev/null; then
            chmod +x "$DAEMON_PATH"
            log "Installing daemon service..."
            python3 "$DAEMON_PATH" --install
        else
            log "Daemon download failed — skipping. Install manually later." "WARN"
        fi
    else
        log "No daemon.conf found — daemon not installed." "WARN"
    fi

    log "Install complete."
    echo ""
    echo "  Logs:   $LOG_FILE"
    echo "  Config: $CONF_FILE"
    exit 0
fi

# ── Default: one-time check-in ────────────────────────────────────────────────
do_checkin
exit 0
`

    const fn = platform === 'mac' ? 'valhalla-agent-mac.sh' : 'valhalla-agent-linux.sh'
    return new NextResponse(script, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fn}"`,
      },
    })
  }

  // ── Windows PowerShell ────────────────────────────────────────────────────
  if (platform === 'windows') {
    const lines = [
      '#Requires -Version 5.1',
      'param([switch]$Install, [switch]$Uninstall)',
      '',
      `$ApiKey          = "${apiKey}"`,
      `$CustomerName    = "${customerName}"`,
      `$SupabaseUrl     = "${supabaseUrl}"`,
      `$SupabaseAnonKey = "${anonKey}"`,
      `$AgentEndpoint   = "${endpoint}"`,
      `$DaemonUrl       = "${appUrl}/api/agent/download?platform=daemon"`,
      '$AgentVersion    = "1.0.0"',
      '$AgentDir        = "C:\\ProgramData\\ValhallaIT"',
      '$LogFile         = "$AgentDir\\agent.log"',
      '$ConfFile        = "$AgentDir\\daemon.conf"',
      '$TaskName        = "ValhallaIT-AssetAgent"',
      '',
      'function Write-Log { param([string]$Msg, [string]$Level="INFO") $line = "[$(Get-Date -Format \'yyyy-MM-dd HH:mm:ss\')] [$Level] $Msg"; Write-Host $line; if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }; Add-Content -Path $LogFile -Value $line -Encoding UTF8 }',
      '',
      'if ($Uninstall) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue; Write-Log "Uninstalled."; exit 0 }',
      '',
      'function Invoke-CheckIn {',
      '    try {',
      '        $os  = Get-WmiObject Win32_OperatingSystem',
      '        $cpu = (Get-WmiObject Win32_Processor | Select-Object -First 1).Name.Trim()',
      '        $ram = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)',
      '        $d   = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID=\'C:\'"',
      '        $net = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.IPAddress -and $_.IPAddress[0] -notmatch \'^(127\\.|169\\.254\\.)\' } | Select-Object -First 1',
      '        $cs  = Get-WmiObject Win32_ComputerSystem',
      '        $payload = @{ api_key=$ApiKey; hostname=$env:COMPUTERNAME; os=($os.Caption -replace "Microsoft ",""); os_version=$os.Version; os_type="windows"; cpu=$cpu; ram_gb=$ram; disk_gb=if($d){[Math]::Round($d.Size/1GB,1)}else{$null}; disk_free_gb=if($d){[Math]::Round($d.FreeSpace/1GB,1)}else{$null}; ip_address=if($net){$net.IPAddress[0]}else{""}; mac_address=if($net){$net.MACAddress}else{""}; manufacturer=$cs.Manufacturer.Trim(); model=$cs.Model.Trim(); serial_number=(Get-WmiObject Win32_BIOS).SerialNumber.Trim(); agent_version=$AgentVersion; customer_name=$CustomerName } | ConvertTo-Json',
      '        $resp = Invoke-RestMethod -Uri $AgentEndpoint -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 30',
      '        Write-Log "Check-in OK. Device: $($resp.device_id)"',
      '        return $resp.device_id',
      '    } catch { Write-Log "Check-in failed: $_" "ERROR"; return $null }',
      '}',
      '',
      'if ($Install) {',
      '    Write-Log "Installing..."',
      '    if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }',
      '    Copy-Item -Path $MyInvocation.MyCommand.Path -Destination "$AgentDir\\valhalla-agent.ps1" -Force',
      '    $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentDir\\valhalla-agent.ps1`""',
      '    $t = New-ScheduledTaskTrigger -Daily -At "08:00"',
      '    $s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -RunOnlyIfNetworkAvailable',
      '    $p = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
      '    Register-ScheduledTask -TaskName $TaskName -Action $a -Trigger $t -Settings $s -Principal $p -Description "Valhalla IT Agent" -Force | Out-Null',
      '    $did = Invoke-CheckIn',
      '    if ($did) {',
      '        "SUPABASE_URL=$SupabaseUrl`nSUPABASE_ANON_KEY=$SupabaseAnonKey`nDEVICE_ID=$did`nAGENT_API_KEY=$ApiKey" | Set-Content -Path $ConfFile -Encoding UTF8',
      '        Write-Log "Config saved."',
      '        $dp = "$AgentDir\\valhalla-daemon.py"',
      '        Invoke-WebRequest -Uri $DaemonUrl -OutFile $dp -UseBasicParsing -ErrorAction SilentlyContinue',
      '        if (Test-Path $dp) { python3 "$dp" --install; Write-Log "Daemon installed." }',
      '    }',
      '    Write-Log "Done. Logs: $LogFile"; exit 0',
      '}',
      '',
      'Invoke-CheckIn; exit 0',
    ].join('\n')

    return new NextResponse(lines, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="valhalla-agent.ps1"',
      },
    })
  }

  return new NextResponse('Unknown platform', { status: 400 })
}
