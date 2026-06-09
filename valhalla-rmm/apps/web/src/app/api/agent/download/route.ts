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
  const platform     = searchParams.get('platform') || 'windows'
  const customerName = searchParams.get('customer') || ''

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Authenticate the requesting user ────────────────────────────────────────
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

  if (!apiKey) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-device`

  // ── Windows PowerShell script ────────────────────────────────────────────────
  if (platform === 'windows') {
    // Note: \` escapes the backtick inside the PS here-string,
    // and we avoid TypeScript template conflicts by using string concat for bash-style vars
    const script = [
      '#Requires -Version 5.1',
      '<#',
      '.SYNOPSIS',
      '    Valhalla IT Asset Agent for Windows.',
      '    Run as Administrator to install as a daily scheduled task.',
      '#>',
      'param([switch]$Install, [switch]$Uninstall)',
      '',
      '# Pre-configured — do not edit',
      `$ApiKey        = "${apiKey}"`,
      `$CustomerName  = "${customerName}"`,
      '$AgentVersion  = "1.0.0"',
      `$AgentEndpoint = "${endpoint}"`,
      '$AgentDir      = "C:\\ProgramData\\ValhallaIT"',
      '$LogFile       = "$AgentDir\\agent.log"',
      '$TaskName      = "ValhallaIT-AssetAgent"',
      '',
      'function Write-Log {',
      '    param([string]$Message, [string]$Level = "INFO")',
      '    $line = "[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] [$Level] $Message"',
      '    Write-Host $line',
      '    if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }',
      '    Add-Content -Path $LogFile -Value $line -Encoding UTF8',
      '}',
      '',
      'if ($Uninstall) {',
      '    Write-Log "Uninstalling Valhalla IT Agent..."',
      '    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue',
      '    Write-Log "Scheduled task removed. Files remain at $AgentDir"',
      '    exit 0',
      '}',
      '',
      'if ($Install) {',
      '    Write-Log "Installing..."',
      '    if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null }',
      '    Copy-Item -Path $MyInvocation.MyCommand.Path -Destination "$AgentDir\\valhalla-agent.ps1" -Force',
      '    $action    = New-ScheduledTaskAction -Execute "powershell.exe" `',
      '        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentDir\\valhalla-agent.ps1`""',
      '    $trigger   = New-ScheduledTaskTrigger -Daily -At "08:00"',
      '    $settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) `',
      '        -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 2 `',
      '        -RestartInterval (New-TimeSpan -Minutes 5)',
      '    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
      '    try {',
      '        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `',
      '            -Settings $settings -Principal $principal `',
      '            -Description "Valhalla IT Asset Agent" -Force | Out-Null',
      '        Write-Log "Scheduled task created. Runs daily at 8:00am."',
      '    } catch {',
      '        Write-Log "Failed — make sure you are running as Administrator: $_" "ERROR"',
      '        exit 1',
      '    }',
      '    Write-Log "Running initial check-in..."',
      '    Start-ScheduledTask -TaskName $TaskName',
      '    Write-Log "Install complete."',
      '    exit 0',
      '}',
      '',
      '# ── Check-in ─────────────────────────────────────────────────────────────',
      'Write-Log "Starting check-in (v$AgentVersion)..."',
      'try {',
      '    $hostname     = $env:COMPUTERNAME',
      '    $os           = Get-WmiObject Win32_OperatingSystem',
      '    $osName       = $os.Caption -replace "Microsoft ", ""',
      '    $osVersion    = $os.Version',
      '    $cpu          = (Get-WmiObject Win32_Processor | Select-Object -First 1).Name.Trim()',
      '    $ramGB        = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)',
      '    $disk         = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID=\'C:\'"',
      '    $diskGB       = if ($disk) { [Math]::Round($disk.Size / 1GB, 1) } else { $null }',
      '    $diskFreeGB   = if ($disk) { [Math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }',
      '    $net          = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.IPAddress -and $_.IPAddress[0] -notmatch \'^(127\\.|169\\.254\\.)\' } | Select-Object -First 1',
      '    $ipAddress    = if ($net) { $net.IPAddress[0] } else { "" }',
      '    $macAddress   = if ($net) { $net.MACAddress } else { "" }',
      '    $cs           = Get-WmiObject Win32_ComputerSystem',
      '    $manufacturer = $cs.Manufacturer.Trim()',
      '    $model        = $cs.Model.Trim()',
      '    $serialNumber = (Get-WmiObject Win32_BIOS).SerialNumber.Trim()',
      '} catch { Write-Log "Failed to collect system info: $_" "ERROR"; exit 1 }',
      '',
      '$payload = @{',
      '    api_key       = $ApiKey',
      '    hostname      = $hostname',
      '    os            = $osName',
      '    os_version    = $osVersion',
      '    os_type       = "windows"',
      '    cpu           = $cpu',
      '    ram_gb        = $ramGB',
      '    disk_gb       = $diskGB',
      '    disk_free_gb  = $diskFreeGB',
      '    ip_address    = $ipAddress',
      '    mac_address   = $macAddress',
      '    manufacturer  = $manufacturer',
      '    model         = $model',
      '    serial_number = $serialNumber',
      '    agent_version = $AgentVersion',
      '    customer_name = $CustomerName',
      '} | ConvertTo-Json',
      '',
      'try {',
      '    $response = Invoke-RestMethod -Uri $AgentEndpoint -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 30',
      '    if ($response.ok) { Write-Log "Check-in successful. Device ID: $($response.device_id)" }',
      '    else { Write-Log "Unexpected response: $($response | ConvertTo-Json)" "WARN" }',
      '} catch { Write-Log "Check-in failed: $_" "ERROR"; exit 1 }',
      '',
      'Write-Log "Done."',
      'exit 0',
    ].join('\n')

    return new NextResponse(script, {
      headers: {
        'Content-Type':        'application/octet-stream',
        'Content-Disposition': 'attachment; filename="valhalla-agent.ps1"',
      },
    })
  }

  // ── macOS / Linux bash script ────────────────────────────────────────────────
  // All bash ${VAR:-default} patterns are built via string concat to avoid
  // conflicting with TypeScript template literal interpolation.
  const ramGbExpr      = '${RAM_GB:-null}'
  const diskGbExpr     = '${DISK_GB:-null}'
  const diskFreeExpr   = '${DISK_FREE_GB:-null}'
  const logLevelExpr   = '${2:-INFO}'
  const osNameExpr     = '${OS_NAME}'

  const script = `#!/bin/bash
# Valhalla IT Asset Agent — ${platform === 'mac' ? 'macOS' : 'Linux'}
# Pre-configured for your organization.
#
# Usage:
#   Run once:    bash valhalla-agent.sh
#   Install:     sudo bash valhalla-agent.sh --install
#   Uninstall:   bash valhalla-agent.sh --uninstall

AGENT_VERSION="1.0.0"
API_KEY="${apiKey}"
CUSTOMER_NAME="${customerName}"
AGENT_ENDPOINT="${endpoint}"
AGENT_DIR="/usr/local/valhalla-it"
LOG_FILE="$AGENT_DIR/agent.log"
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
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${logLevelExpr}] $1"
    echo "$msg"
    mkdir -p "$AGENT_DIR"
    echo "$msg" >> "$LOG_FILE"
}

if [[ "$DO_UNINSTALL" == "true" ]]; then
    log "Uninstalling Valhalla IT Agent..."
    crontab -l 2>/dev/null | grep -v "$CRON_TAG" | crontab -
    if [[ "$(uname)" == "Darwin" ]] && [[ -f "$LAUNCH_PLIST" ]]; then
        launchctl unload "$LAUNCH_PLIST" 2>/dev/null
        rm -f "$LAUNCH_PLIST"
        log "LaunchAgent removed."
    fi
    log "Uninstall complete. Files remain at $AGENT_DIR"
    exit 0
fi

if [[ "$DO_INSTALL" == "true" ]]; then
    log "Installing Valhalla IT Agent..."
    mkdir -p "$AGENT_DIR"
    cp "$0" "$AGENT_DIR/valhalla-agent.sh"
    chmod +x "$AGENT_DIR/valhalla-agent.sh"

    if [[ "$(uname)" == "Darwin" ]]; then
        mkdir -p "$HOME/Library/LaunchAgents"
        cat > "$LAUNCH_PLIST" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.valhallait.agent</string>
    <key>ProgramArguments</key><array>
        <string>/bin/bash</string>
        <string>AGENT_DIR_PLACEHOLDER/valhalla-agent.sh</string>
    </array>
    <key>StartCalendarInterval</key><dict>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>RunAtLoad</key><true/>
</dict></plist>
PLIST
        sed -i '' "s|AGENT_DIR_PLACEHOLDER|$AGENT_DIR|g" "$LAUNCH_PLIST"
        launchctl load "$LAUNCH_PLIST"
        log "LaunchAgent installed. Runs daily at 8:00am."
    else
        (crontab -l 2>/dev/null | grep -v "$CRON_TAG"; echo "0 8 * * * /bin/bash $AGENT_DIR/valhalla-agent.sh $CRON_TAG") | crontab -
        log "Cron job installed. Runs daily at 8:00am."
    fi

    log "Running initial check-in..."
    bash "$AGENT_DIR/valhalla-agent.sh"
    log "Install complete."
    exit 0
fi

UNAME="$(uname -s)"
[[ "$UNAME" == "Darwin" ]] && OS_TYPE="macos" || OS_TYPE="linux"
log "Starting check-in (v$AGENT_VERSION, $OS_TYPE)..."
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

log "Collected: $HOSTNAME_VAL | ${osNameExpr} | RAM: ${ramGbExpr}GB | Disk free: ${diskFreeExpr}/${diskGbExpr}GB | IP: $IP_ADDRESS"

PAYLOAD=$(printf '%s' '{' \\
    '"api_key":"'"$API_KEY"'",' \\
    '"hostname":"'"$HOSTNAME_VAL"'",' \\
    '"os":"'"$OS_NAME"'",' \\
    '"os_version":"'"$OS_VERSION"'",' \\
    '"os_type":"'"$OS_TYPE"'",' \\
    '"cpu":"'"$CPU"'",' \\
    '"ram_gb":'"${ramGbExpr}"',' \\
    '"disk_gb":'"${diskGbExpr}"',' \\
    '"disk_free_gb":'"${diskFreeExpr}"',' \\
    '"ip_address":"'"$IP_ADDRESS"'",' \\
    '"mac_address":"'"$MAC_ADDRESS"'",' \\
    '"manufacturer":"'"$MANUFACTURER"'",' \\
    '"model":"'"$MODEL"'",' \\
    '"serial_number":"'"$SERIAL"'",' \\
    '"agent_version":"'"$AGENT_VERSION"'",' \\
    '"customer_name":"'"$CUSTOMER_NAME"'"' \\
    '}')

RESPONSE="$(curl -s -w "\\n%{http_code}" -X POST "$AGENT_ENDPOINT" \\
    -H "Content-Type: application/json" -d "$PAYLOAD" --max-time 30 2>&1)"

HTTP_CODE="$(echo "$RESPONSE" | tail -1)"
BODY="$(echo "$RESPONSE" | head -n -1)"

if [[ "$HTTP_CODE" == "200" ]]; then
    log "Check-in successful: $BODY"
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
