// @ts-nocheck
// apps/web/src/app/api/agent/download/route.ts
//
// Serves pre-configured agent scripts with all credentials embedded.
// --install flag on the script handles full setup including daemon.

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Auth check
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
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      if (member?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('agent_api_key')
          .eq('id', member.organization_id)
          .single()
        apiKey = org?.agent_api_key ?? null
      }
    } catch { /* try next */ }
    break
  }

  if (!apiKey) return new NextResponse('Unauthorized', { status: 401 })

  const endpoint   = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-device`
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const daemonUrl  = `${process.env.NEXT_PUBLIC_APP_URL}/api/agent/download?platform=daemon`

  // ── Linux / macOS bash script ─────────────────────────────────────────────
  if (platform === 'linux' || platform === 'mac') {
    const ramExpr      = '${RAM_GB:-null}'
    const diskExpr     = '${DISK_GB:-null}'
    const diskFreeExpr = '${DISK_FREE_GB:-null}'
    const logLevel     = '${2:-INFO}'
    const osNameExpr   = '${OS_NAME}'

    const script = `#!/bin/bash
# Valhalla IT Asset Agent — ${platform === 'mac' ? 'macOS' : 'Linux'}
# Pre-configured. Run with --install to set up agent + remote access daemon.
#
# Usage:
#   bash valhalla-agent.sh              # one-time check-in
#   sudo bash valhalla-agent.sh --install        # install agent + daemon (recommended)
#   sudo bash valhalla-agent.sh --uninstall      # remove everything

AGENT_VERSION="1.0.0"
API_KEY="${apiKey}"
CUSTOMER_NAME="${customerName}"
SUPABASE_URL="${supabaseUrl}"
SUPABASE_ANON_KEY="${anonKey}"
AGENT_ENDPOINT="${endpoint}"
DAEMON_DOWNLOAD_URL="${daemonUrl}"
AGENT_DIR="/usr/local/valhalla-it"
LOG_FILE="$AGENT_DIR/agent.log"
CONF_FILE="$AGENT_DIR/daemon.conf"
CRON_TAG="# valhalla-it-agent"
LAUNCH_PLIST="$HOME/Library/LaunchAgents/com.valhallait.agent.plist"

DO_INSTALL=false
DO_UNINSTALL=false
for arg in "$@"; do
    case "$arg" in
        --install)   DO_INSTALL=true   ;;
        --uninstall) DO_UNINSTALL=true ;;
    esac
done

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${logLevel}] $1"
    echo "$msg"
    mkdir -p "$AGENT_DIR"
    echo "$msg" >> "$LOG_FILE"
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
if [[ "$DO_UNINSTALL" == "true" ]]; then
    log "Uninstalling Valhalla IT Agent..."
    crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab -
    if [[ "$(uname)" == "Darwin" ]] && [[ -f "$LAUNCH_PLIST" ]]; then
        launchctl unload "$LAUNCH_PLIST" 2>/dev/null && rm -f "$LAUNCH_PLIST"
    fi
    if [[ "$(uname)" == "Linux" ]]; then
        systemctl stop valhalla-daemon 2>/dev/null
        systemctl disable valhalla-daemon 2>/dev/null
        rm -f /etc/systemd/system/valhalla-daemon.service
        systemctl daemon-reload
    fi
    log "Uninstall complete."
    exit 0
fi

# ── Install ───────────────────────────────────────────────────────────────────
if [[ "$DO_INSTALL" == "true" ]]; then
    log "Installing Valhalla IT Agent..."
    mkdir -p "$AGENT_DIR"

    # Copy agent script
    cp "$0" "$AGENT_DIR/valhalla-agent.sh"
    chmod +x "$AGENT_DIR/valhalla-agent.sh"

    # Schedule daily check-in
    if [[ "$(uname)" == "Darwin" ]]; then
        mkdir -p "$HOME/Library/LaunchAgents"
        cat > "$LAUNCH_PLIST" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.valhallait.agent</string>
    <key>ProgramArguments</key><array>
        <string>/bin/bash</string>
        <string>AGENT_DIR_PH/valhalla-agent.sh</string>
    </array>
    <key>StartCalendarInterval</key><dict>
        <key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer>
    </dict>
    <key>RunAtLoad</key><true/>
</dict></plist>
PLIST
        sed -i '' "s|AGENT_DIR_PH|$AGENT_DIR|g" "$LAUNCH_PLIST"
        launchctl load "$LAUNCH_PLIST"
        log "LaunchAgent installed."
    else
        (crontab -l 2>/dev/null | grep -v "$CRON_TAG"; echo "0 8 * * * /bin/bash $AGENT_DIR/valhalla-agent.sh $CRON_TAG") | crontab -
        log "Cron job installed."
    fi

    # Run initial check-in to register device and get DEVICE_ID
    log "Running initial check-in..."
    bash "$AGENT_DIR/valhalla-agent.sh"

    # Install daemon if config was created
    if [[ -f "$CONF_FILE" ]]; then
        log "Installing remote access daemon..."
        DAEMON_PATH="$AGENT_DIR/valhalla-daemon.py"

        # Download daemon
        if command -v curl &>/dev/null; then
            curl -sf -o "$DAEMON_PATH" "$DAEMON_DOWNLOAD_URL" && chmod +x "$DAEMON_PATH"
        elif command -v wget &>/dev/null; then
            wget -q -O "$DAEMON_PATH" "$DAEMON_DOWNLOAD_URL" && chmod +x "$DAEMON_PATH"
        fi

        if [[ -f "$DAEMON_PATH" ]]; then
            python3 "$DAEMON_PATH" --install
            log "Remote access daemon installed."
        else
            log "Could not download daemon — skipping. Run manually: python3 valhalla-daemon.py --install" "WARN"
        fi
    fi

    log "Installation complete!"
    echo ""
    echo "  Agent:  daily check-in scheduled"
    echo "  Daemon: $(systemctl is-active valhalla-daemon 2>/dev/null || echo 'see logs')"
    echo "  Logs:   $LOG_FILE"
    exit 0
fi

# ── Check-in ──────────────────────────────────────────────────────────────────
UNAME="$(uname -s)"
[[ "$UNAME" == "Darwin" ]] && OS_TYPE="macos" || OS_TYPE="linux"
log "Check-in starting (v$AGENT_VERSION, $OS_TYPE)..."
HOSTNAME_VAL="$(hostname -s)"

if [[ "$OS_TYPE" == "macos" ]]; then
    OS_NAME="$(sw_vers -productName) $(sw_vers -productVersion)"
    OS_VERSION="$(sw_vers -productVersion)"
    CPU="$(sysctl -n machdep.cpu.brand_string 2>/dev/null | xargs)"
    RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null)"
    RAM_GB="$(echo "scale=1; $RAM_BYTES / 1073741824" | bc 2>/dev/null)"
    MANUFACTURER="Apple"; MODEL="$(sysctl -n hw.model 2>/dev/null | xargs)"
    SERIAL="$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial Number/ {print $NF}')"
    DISK_INFO="$(df -k / | tail -1)"
    DISK_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $2}') / 1048576" | bc 2>/dev/null)"
    DISK_FREE_GB="$(echo "scale=1; $(echo "$DISK_INFO" | awk '{print $4}') / 1048576" | bc 2>/dev/null)"
    PRIMARY_IFACE="$(route get default 2>/dev/null | awk '/interface/ {print $2}' | head -1)"
    IP_ADDRESS="$(ipconfig getifaddr "$PRIMARY_IFACE" 2>/dev/null)"
    MAC_ADDRESS="$(ifconfig "$PRIMARY_IFACE" 2>/dev/null | awk '/ether/ {print $2}' | head -1)"
else
    OS_NAME="$(cat /etc/os-release 2>/dev/null | awk -F= '/^PRETTY_NAME/ {gsub(/"/, "", $2); print $2}')"
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
    IP_ADDRESS="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {print $7}' | head -1)"
    PRIMARY_IFACE="$(ip route get 1.1.1.1 2>/dev/null | awk '/dev/ {print $5}' | head -1)"
    MAC_ADDRESS="$(cat /sys/class/net/"$PRIMARY_IFACE"/address 2>/dev/null | xargs)"
fi

PAYLOAD=$(printf '%s' '{"api_key":"'"$API_KEY"'","hostname":"'"$HOSTNAME_VAL"'","os":"'"$OS_NAME"'","os_version":"'"$OS_VERSION"'","os_type":"'"$OS_TYPE"'","cpu":"'"$CPU"'","ram_gb":'"${ramExpr}"',"disk_gb":'"${diskExpr}"',"disk_free_gb":'"${diskFreeExpr}"',"ip_address":"'"$IP_ADDRESS"'","mac_address":"'"$MAC_ADDRESS"'","manufacturer":"'"$MANUFACTURER"'","model":"'"$MODEL"'","serial_number":"'"$SERIAL"'","agent_version":"'"$AGENT_VERSION"'","customer_name":"'"$CUSTOMER_NAME"'"}')

RESPONSE="$(curl -sf -w "\\n%{http_code}" -X POST "$AGENT_ENDPOINT" \\
    -H "Content-Type: application/json" -d "$PAYLOAD" --max-time 30 2>&1)"

HTTP_CODE="$(echo "$RESPONSE" | tail -1)"
BODY="$(echo "$RESPONSE" | head -n -1)"

if [[ "$HTTP_CODE" == "200" ]]; then
    log "Check-in successful."

    # Extract and save device ID for daemon
    DEVICE_ID="$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('device_id',''))" 2>/dev/null)"
    if [[ -n "$DEVICE_ID" ]]; then
        mkdir -p "$AGENT_DIR"
        cat > "$CONF_FILE" << CONF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
DEVICE_ID=$DEVICE_ID
AGENT_API_KEY=$API_KEY
CONF
        log "Device ID saved: $DEVICE_ID"
    fi
else
    log "Check-in failed (HTTP $HTTP_CODE): $BODY" "ERROR"; exit 1
fi

log "Done."
exit 0
`

    const filename = platform === 'mac' ? 'valhalla-agent-mac.sh' : 'valhalla-agent-linux.sh'
    return new NextResponse(script, {
      headers: {
        'Content-Type':        'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── Windows PowerShell ────────────────────────────────────────────────────
  if (platform === 'windows') {
    const lines = [
      '#Requires -Version 5.1',
      '<#',
      '.SYNOPSIS',
      '    Valhalla IT Asset Agent for Windows.',
      '    Run as Administrator. Use -Install to set up agent + daemon.',
      '#>',
      'param([switch]$Install, [switch]$Uninstall)',
      '',
      '# Pre-configured',
      `$ApiKey           = "${apiKey}"`,
      `$CustomerName     = "${customerName}"`,
      `$SupabaseUrl      = "${supabaseUrl}"`,
      `$SupabaseAnonKey  = "${anonKey}"`,
      `$AgentEndpoint    = "${endpoint}"`,
      `$DaemonDownloadUrl= "${daemonUrl}"`,
      '$AgentVersion     = "1.0.0"',
      '$AgentDir         = "C:\\ProgramData\\ValhallaIT"',
      '$LogFile          = "$AgentDir\\agent.log"',
      '$ConfFile         = "$AgentDir\\daemon.conf"',
      '$TaskName         = "ValhallaIT-AssetAgent"',
      '',
      'function Write-Log {',
      '    param([string]$Message, [string]$Level = "INFO")',
      '    $line = "[$(Get-Date -Format \'yyyy-MM-dd HH:mm:ss\')] [$Level] $Message"',
      '    Write-Host $line',
      '    if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }',
      '    Add-Content -Path $LogFile -Value $line -Encoding UTF8',
      '}',
      '',
      'if ($Uninstall) {',
      '    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue',
      '    $svc = "C:\\ProgramData\\ValhallaIT\\valhalla-daemon.service"',
      '    Write-Log "Uninstalled."',
      '    exit 0',
      '}',
      '',
      '# ── Check-in ─────────────────────────────────────────────────────────────',
      'function Invoke-CheckIn {',
      '    Write-Log "Starting check-in (v$AgentVersion)..."',
      '    try {',
      '        $os     = Get-WmiObject Win32_OperatingSystem',
      '        $cpu    = (Get-WmiObject Win32_Processor | Select-Object -First 1).Name.Trim()',
      '        $ramGB  = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)',
      '        $disk   = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID=\'C:\'"',
      '        $diskGB = if ($disk) { [Math]::Round($disk.Size / 1GB, 1) } else { $null }',
      '        $diskFreeGB = if ($disk) { [Math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }',
      '        $net    = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.IPAddress -and $_.IPAddress[0] -notmatch \'^(127\\.|169\\.254\\.)\' } | Select-Object -First 1',
      '        $ip     = if ($net) { $net.IPAddress[0] } else { "" }',
      '        $mac    = if ($net) { $net.MACAddress } else { "" }',
      '        $cs     = Get-WmiObject Win32_ComputerSystem',
      '        $bios   = Get-WmiObject Win32_BIOS',
      '        $payload = @{',
      '            api_key       = $ApiKey; hostname = $env:COMPUTERNAME',
      '            os            = ($os.Caption -replace "Microsoft ", ""); os_version = $os.Version',
      '            os_type       = "windows"; cpu = $cpu; ram_gb = $ramGB',
      '            disk_gb       = $diskGB; disk_free_gb = $diskFreeGB',
      '            ip_address    = $ip; mac_address = $mac',
      '            manufacturer  = $cs.Manufacturer.Trim(); model = $cs.Model.Trim()',
      '            serial_number = $bios.SerialNumber.Trim()',
      '            agent_version = $AgentVersion; customer_name = $CustomerName',
      '        } | ConvertTo-Json',
      '        $resp = Invoke-RestMethod -Uri $AgentEndpoint -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 30',
      '        Write-Log "Check-in successful. Device ID: $($resp.device_id)"',
      '        return $resp.device_id',
      '    } catch {',
      '        Write-Log "Check-in failed: $_" "ERROR"; return $null',
      '    }',
      '}',
      '',
      'if ($Install) {',
      '    Write-Log "Installing Valhalla IT Agent..."',
      '    if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }',
      '    Copy-Item -Path $MyInvocation.MyCommand.Path -Destination "$AgentDir\\valhalla-agent.ps1" -Force',
      '    $action    = New-ScheduledTaskAction -Execute "powershell.exe" `',
      '        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentDir\\valhalla-agent.ps1`""',
      '    $trigger   = New-ScheduledTaskTrigger -Daily -At "08:00"',
      '    $settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -RunOnlyIfNetworkAvailable',
      '    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
      '    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `',
      '        -Settings $settings -Principal $principal -Description "Valhalla IT Agent" -Force | Out-Null',
      '    Write-Log "Scheduled task created."',
      '',
      '    # Run check-in to register device',
      '    $deviceId = Invoke-CheckIn',
      '',
      '    if ($deviceId) {',
      '        # Save daemon config',
      '        $conf = "SUPABASE_URL=$SupabaseUrl`nSUPABASE_ANON_KEY=$SupabaseAnonKey`nDEVICE_ID=$deviceId`nAGENT_API_KEY=$ApiKey"',
      '        $conf | Set-Content -Path $ConfFile -Encoding UTF8',
      '        Write-Log "Daemon config saved."',
      '',
      '        # Download and install daemon',
      '        $daemonPath = "$AgentDir\\valhalla-daemon.py"',
      '        Invoke-WebRequest -Uri $DaemonDownloadUrl -OutFile $daemonPath -UseBasicParsing',
      '        Write-Log "Daemon downloaded."',
      '        python3 "$daemonPath" --install',
      '        Write-Log "Daemon installed."',
      '    }',
      '',
      '    Write-Log "Installation complete!"',
      '    Write-Host ""',
      '    Write-Host "  Agent:  daily check-in scheduled (Task Scheduler)"',
      '    Write-Host "  Daemon: check Services for ValhallaIT-Daemon"',
      '    Write-Host "  Logs:   $LogFile"',
      '    exit 0',
      '}',
      '',
      '# Default: just check in',
      'Invoke-CheckIn',
      'exit 0',
    ].join('\n')

    return new NextResponse(lines, {
      headers: {
        'Content-Type':        'application/octet-stream',
        'Content-Disposition': 'attachment; filename="valhalla-agent.ps1"',
      },
    })
  }

  // ── Serve the Python daemon script ─────────────────────────────────────────
  if (platform === 'daemon') {
    // Read the daemon source from the file system or return a redirect
    // The daemon content is served from the public directory or inline
    const daemonScript = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/valhalla-daemon.py`
    ).then(r => r.text()).catch(() => null)

    if (!daemonScript) {
      return new NextResponse('Daemon script not found', { status: 404 })
    }

    return new NextResponse(daemonScript, {
      headers: {
        'Content-Type':        'text/plain',
        'Content-Disposition': 'attachment; filename="valhalla-daemon.py"',
      },
    })
  }

  return new NextResponse('Unknown platform', { status: 400 })
}
