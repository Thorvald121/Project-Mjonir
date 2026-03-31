#!/bin/bash
# Valhalla RMM Asset Agent — macOS / Linux
# Run once to register this device, or add to cron to keep it updated.
#
# Usage:
#   chmod +x register-macos-linux.sh
#   ./register-macos-linux.sh --org-id YOUR_ORG_UUID --api-key YOUR_ANON_KEY
#   ./register-macos-linux.sh --org-id YOUR_ORG_UUID --api-key YOUR_ANON_KEY --customer-id CUST_UUID --customer-name "Acme Corp"
#
# To schedule (cron daily at 8am):
#   echo "0 8 * * * /path/to/register-macos-linux.sh --org-id YOUR_ORG_ID --api-key YOUR_API_KEY" | crontab -

set -e

ENDPOINT="https://yetrdrgagfovphrerpie.supabase.co/functions/v1/register-agent"
ORG_ID=""
API_KEY=""
CUSTOMER_ID=""
CUSTOMER_NAME=""
AGENT_VERSION="1.0-unix"

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --org-id)       ORG_ID="$2";       shift 2 ;;
        --api-key)      API_KEY="$2";      shift 2 ;;
        --customer-id)  CUSTOMER_ID="$2";  shift 2 ;;
        --customer-name)CUSTOMER_NAME="$2";shift 2 ;;
        --endpoint)     ENDPOINT="$2";     shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ -z "$ORG_ID" ] || [ -z "$API_KEY" ]; then
    echo "Usage: $0 --org-id ORG_UUID --api-key ANON_KEY"
    exit 1
fi

echo "Valhalla RMM Asset Agent v1.0 (Unix)"

# Detect OS
OS_TYPE="$(uname -s)"
HOSTNAME_VAL="$(hostname -s 2>/dev/null || hostname)"

if [ "$OS_TYPE" = "Darwin" ]; then
    # macOS
    OS="macOS $(sw_vers -productVersion)"
    OS_VERSION="$(sw_vers -productVersion)"
    CPU="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo '')"
    RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
    RAM_GB=$(echo "scale=1; $RAM_BYTES / 1073741824" | bc 2>/dev/null || echo "0")
    DISK_GB=$(df -g / 2>/dev/null | awk 'NR==2{print $2}' || echo "0")
    DISK_FREE_GB=$(df -g / 2>/dev/null | awk 'NR==2{print $4}' || echo "0")
    SERIAL="$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Serial Number/{print $NF}' || echo '')"
    MODEL="$(system_profiler SPHardwareDataType 2>/dev/null | awk '/Model Name/{$1=$2=""; print $0}' | xargs || echo '')"
    MANUFACTURER="Apple"
    IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"
    MAC="$(ifconfig en0 2>/dev/null | awk '/ether/{print $2}' || echo '')"
    USERNAME="$(whoami)"
    DOMAIN=""
    AGENT_VERSION="1.0-macos"
else
    # Linux
    OS="$(lsb_release -ds 2>/dev/null || cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"' || uname -sr)"
    OS_VERSION="$(uname -r)"
    CPU="$(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2 | xargs || echo '')"
    RAM_KB="$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)"
    RAM_GB=$(echo "scale=1; $RAM_KB / 1048576" | bc 2>/dev/null || echo "0")
    DISK_GB=$(df -BG / 2>/dev/null | awk 'NR==2{gsub(/G/,"",$2); print $2}' || echo "0")
    DISK_FREE_GB=$(df -BG / 2>/dev/null | awk 'NR==2{gsub(/G/,"",$4); print $4}' || echo "0")
    SERIAL="$(cat /sys/class/dmi/id/product_serial 2>/dev/null | tr -d ' ' || dmidecode -s system-serial-number 2>/dev/null || echo '')"
    MODEL="$(cat /sys/class/dmi/id/product_name 2>/dev/null || dmidecode -s system-product-name 2>/dev/null || echo '')"
    MANUFACTURER="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || dmidecode -s system-manufacturer 2>/dev/null || echo '')"
    IP="$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo '')"
    MAC="$(ip link 2>/dev/null | awk '/ether/{print $2}' | head -1 || cat /sys/class/net/*/address 2>/dev/null | head -1 || echo '')"
    USERNAME="$(whoami)"
    DOMAIN="$(dnsdomainname 2>/dev/null || echo '')"
    AGENT_VERSION="1.0-linux"
fi

echo "Registering: $HOSTNAME_VAL ($OS, ${RAM_GB}GB RAM, ${DISK_GB}GB disk)"

# Build JSON safely
CUSTOMER_FIELDS=""
if [ -n "$CUSTOMER_ID" ];   then CUSTOMER_FIELDS="$CUSTOMER_FIELDS, \"customer_id\": \"$CUSTOMER_ID\""; fi
if [ -n "$CUSTOMER_NAME" ]; then CUSTOMER_FIELDS="$CUSTOMER_FIELDS, \"customer_name\": \"$(echo $CUSTOMER_NAME | sed 's/"/\\"/g')\""; fi

JSON=$(cat <<EOF
{
  "org_id":        "$ORG_ID",
  "hostname":      "$HOSTNAME_VAL",
  "os":            "$OS",
  "os_version":    "$OS_VERSION",
  "cpu":           "$CPU",
  "ram_gb":        $RAM_GB,
  "disk_gb":       $DISK_GB,
  "disk_free_gb":  $DISK_FREE_GB,
  "ip_address":    "$IP",
  "mac_address":   "$MAC",
  "serial_number": "$SERIAL",
  "model":         "$MODEL",
  "manufacturer":  "$MANUFACTURER",
  "username":      "$USERNAME",
  "domain":        "$DOMAIN",
  "agent_version": "$AGENT_VERSION"
  $CUSTOMER_FIELDS
}
EOF
)

RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "apikey: $API_KEY" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$JSON")

if echo "$RESPONSE" | grep -q '"ok":true'; then
    ACTION=$(echo "$RESPONSE" | grep -o '"action":"[^"]*"' | cut -d'"' -f4)
    ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "Success: $ACTION device '$HOSTNAME_VAL' (ID: $ID)"
else
    echo "Error: $RESPONSE"
    exit 1
fi