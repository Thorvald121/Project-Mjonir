# Valhalla RMM Asset Agent — Windows
# Run once to register this device, or schedule via Task Scheduler to keep it updated.
#
# Usage:
#   .\register-windows.ps1 -OrgId "your-org-uuid" -ApiKey "your-anon-key"
#   .\register-windows.ps1 -OrgId "your-org-uuid" -ApiKey "your-anon-key" -CustomerId "customer-uuid" -CustomerName "Acme Corp"
#
# To schedule (runs daily at 8am):
#   $action  = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NonInteractive -File C:\valhalla-agent\register-windows.ps1 -OrgId YOUR_ORG_ID -ApiKey YOUR_API_KEY"
#   $trigger = New-ScheduledTaskTrigger -Daily -At 8am
#   Register-ScheduledTask -TaskName "Valhalla RMM Agent" -Action $action -Trigger $trigger -RunLevel Highest

param(
    [Parameter(Mandatory=$true)]  [string]$OrgId,
    [Parameter(Mandatory=$true)]  [string]$ApiKey,
    [Parameter(Mandatory=$false)] [string]$CustomerId   = "",
    [Parameter(Mandatory=$false)] [string]$CustomerName = "",
    [Parameter(Mandatory=$false)] [string]$Endpoint     = "https://yetrdrgagfovphrerpie.supabase.co/functions/v1/register-agent"
)

$ErrorActionPreference = "Stop"
Write-Host "Valhalla RMM Asset Agent v1.0 (Windows)" -ForegroundColor Cyan

try {
    # Hostname & OS
    $hostname   = $env:COMPUTERNAME
    $os         = (Get-WmiObject Win32_OperatingSystem).Caption
    $osVersion  = (Get-WmiObject Win32_OperatingSystem).Version
    $username   = $env:USERNAME

    # Domain
    $domain = (Get-WmiObject Win32_ComputerSystem).Domain

    # CPU
    $cpuObj = Get-WmiObject Win32_Processor | Select-Object -First 1
    $cpu    = $cpuObj.Name.Trim()

    # RAM
    $ramBytes = (Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory
    $ramGb    = [math]::Round($ramBytes / 1GB, 1)

    # Disk (C: drive)
    $disk     = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskGb   = [math]::Round($disk.Size / 1GB, 0)
    $diskFree = [math]::Round($disk.FreeSpace / 1GB, 1)

    # Serial number
    $serial = (Get-WmiObject Win32_BIOS).SerialNumber
    if ($serial -eq "To be filled by O.E.M." -or $serial -eq "Default string" -or [string]::IsNullOrWhiteSpace($serial)) {
        $serial = $null
    }

    # Model & manufacturer
    $cs           = Get-WmiObject Win32_ComputerSystem
    $model         = $cs.Model
    $manufacturer  = $cs.Manufacturer

    # IP address (first non-loopback IPv4)
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } | Select-Object -First 1).IPAddress

    # MAC address
    $mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress

    $body = @{
        org_id        = $OrgId
        hostname      = $hostname
        os            = $os
        os_version    = $osVersion
        cpu           = $cpu
        ram_gb        = $ramGb
        disk_gb       = $diskGb
        disk_free_gb  = $diskFree
        ip_address    = $ip
        mac_address   = $mac
        serial_number = $serial
        model         = $model
        manufacturer  = $manufacturer
        username      = $username
        domain        = $domain
        agent_version = "1.0-windows"
    }

    if ($CustomerId)   { $body["customer_id"]   = $CustomerId }
    if ($CustomerName) { $body["customer_name"] = $CustomerName }

    $json = $body | ConvertTo-Json

    Write-Host "Registering: $hostname ($os, ${ramGb}GB RAM, ${diskGb}GB disk)" -ForegroundColor Yellow

    $response = Invoke-RestMethod -Uri $Endpoint -Method POST -Body $json -ContentType "application/json" -Headers @{
        "apikey"        = $ApiKey
        "Authorization" = "Bearer $ApiKey"
    }

    if ($response.ok) {
        $action = $response.action
        $id     = $response.id
        Write-Host "Success: $action device '$hostname' (ID: $id)" -ForegroundColor Green
    } else {
        Write-Host "Error: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}