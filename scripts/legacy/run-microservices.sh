#!/bin/bash
# ============================================================
# Run FPT Event Management Microservices Locally
# Bash script for Linux/macOS to run all 6 services
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

success() { echo -e "  ${GREEN}✔ $1${NC}"; }
error() { echo -e "  ${RED}✘ $1${NC}"; }
warning() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
info() { echo -e "  ${CYAN}→ $1${NC}"; }

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
ENV_FILE="${BACKEND_DIR}/.env"

# Service ports mapping
declare -A SERVICES=(
    ["auth-lambda"]="8081"
    ["event-lambda"]="8082"
    ["ticket-lambda"]="8083"
    ["venue-lambda"]="8084"
    ["staff-lambda"]="8085"
    ["notification-lambda"]="8086"
)

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  FPT Event Management - Microservices Launcher      ║${NC}"
echo -e "${CYAN}║  Local Development Mode (Linux/macOS)               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# STOP MODE
# ============================================================
if [ "${1:-}" = "stop" ] || [ "${1:-}" = "kill" ]; then
    info "Stopping all microservices..."
    echo ""
    
    for svc in "${!SERVICES[@]}"; do
        port="${SERVICES[$svc]}"
        
        # Find and kill process on port
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            pid=$(lsof -Pi :$port -sTCP:LISTEN -t)
            kill -9 $pid 2>/dev/null && success "$svc (port $port) stopped" || warning "Failed to stop $svc"
        else
            info "$svc (port $port) not running"
        fi
    done
    
    echo ""
    success "All services stopped!"
    exit 0
fi

# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================
if [ -f "$ENV_FILE" ]; then
    info "Loading environment from .env..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    success "Environment variables loaded"
else
    warning ".env not found. Using system environment variables."
fi

# Set service URLs
export AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-http://localhost:8081}"
export EVENT_SERVICE_URL="${EVENT_SERVICE_URL:-http://localhost:8082}"
export TICKET_SERVICE_URL="${TICKET_SERVICE_URL:-http://localhost:8083}"
export VENUE_SERVICE_URL="${VENUE_SERVICE_URL:-http://localhost:8084}"
export STAFF_SERVICE_URL="${STAFF_SERVICE_URL:-http://localhost:8085}"
export NOTIFICATION_SERVICE_URL="${NOTIFICATION_SERVICE_URL:-http://localhost:8086}"

# Enable all feature flags
export USE_API_COMPOSITION=true
export VENUE_API_ENABLED=true
export AUTH_API_ENABLED=true
export TICKET_API_ENABLED=true
export EVENT_API_ENABLED=true
export WALLET_SERVICE_ENABLED=true
export SAGA_ENABLED=true
export NOTIFICATION_API_ENABLED=true
export SERVICE_SPECIFIC_SCHEDULER=true
export SERVICE_SPECIFIC_DB=true

echo ""
info "Environment configured (Feature Flags: ALL ENABLED)"
echo ""

# ============================================================
# CHECK PREREQUISITES
# ============================================================
info "Checking prerequisites..."

if ! command -v go &> /dev/null; then
    error "Go is not installed. Download from https://go.dev/dl/"
    exit 1
fi
success "Go: $(go version)"

if [ ! -d "$BACKEND_DIR" ]; then
    error "backend/ directory not found. Run this script from project root."
    exit 1
fi

echo ""

# ============================================================
# BUILD & RUN SERVICES
# ============================================================
SERVICE_TO_RUN="${1:-all}"

cd "$BACKEND_DIR"

start_service() {
    local svc=$1
    local port=${SERVICES[$svc]}
    local svc_dir="services/$svc"
    local binary="$svc-service"
    
    # Check if port is in use
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        warning "$svc (port $port) is already running"
        return 1
    fi
    
    # Build if binary doesn't exist
    if [ ! -f "$svc_dir/$binary" ]; then
        info "Building $svc..."
        cd "$svc_dir"
        if ! go build -o "$binary" . ; then
            error "Build failed for $svc"
            cd "$BACKEND_DIR"
            return 1
        fi
        cd "$BACKEND_DIR"
        success "$svc built"
    fi
    
    # Start service in background with logs
    info "Starting $svc on port $port..."
    cd "$svc_dir"
    
    # Run service and redirect output to log file
    LOG_FILE="/tmp/fpt-$svc.log"
    nohup ./$binary > "$LOG_FILE" 2>&1 &
    local pid=$!
    
    cd "$BACKEND_DIR"
    
    # Wait a bit and check if process is still running
    sleep 1
    if ps -p $pid > /dev/null 2>&1; then
        success "$svc started (PID: $pid, Port: $port)"
        echo "         Log: $LOG_FILE"
        return 0
    else
        error "$svc failed to start. Check log: $LOG_FILE"
        return 1
    fi
}

if [ "$SERVICE_TO_RUN" = "all" ]; then
    # Start all services
    for svc in auth-lambda event-lambda ticket-lambda venue-lambda staff-lambda notification-lambda; do
        start_service "$svc" || true
    done
else
    # Start specific service
    if [ -z "${SERVICES[$SERVICE_TO_RUN]:-}" ]; then
        error "Unknown service: $SERVICE_TO_RUN"
        info "Available: ${!SERVICES[*]}"
        exit 1
    fi
    start_service "$SERVICE_TO_RUN"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✔ Services are running!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
info "Service URLs:"
for svc in "${!SERVICES[@]}"; do
    port="${SERVICES[$svc]}"
    echo -e "  ${CYAN}$svc:${NC} ${YELLOW}http://localhost:$port${NC}"
done | sort

echo ""
info "View logs:"
echo -e "  ${YELLOW}tail -f /tmp/fpt-auth-lambda.log${NC}"
echo -e "  ${YELLOW}tail -f /tmp/fpt-event-lambda.log${NC}"
echo ""
info "To stop all services:"
echo -e "  ${YELLOW}./run-microservices.sh stop${NC}"
echo ""
info "Test APIs:"
echo -e "  ${YELLOW}curl http://localhost:8082/api/events${NC}"
echo -e "  ${YELLOW}curl http://localhost:8081/api/login -X POST -H 'Content-Type: application/json' -d '{...}'${NC}"
echo ""
