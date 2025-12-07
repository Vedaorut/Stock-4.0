#!/bin/bash

# ============================================
# Status Stock 4.0 - Development Manager
# ============================================
# Usage:
#   ./dev.sh start    - Start all services + tunnel
#   ./dev.sh stop     - Stop all services
#   ./dev.sh restart  - Restart all services
#   ./dev.sh status   - Show running services
#   ./dev.sh logs     - Show recent logs
#   ./dev.sh tunnel   - Restart only tunnel (new URL)
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project paths
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
BOT_DIR="$PROJECT_DIR/bot"
WEBAPP_DIR="$PROJECT_DIR/webapp"

# PID files for tracking
PID_DIR="$PROJECT_DIR/.pids"
mkdir -p "$PID_DIR"

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# ============================================
# STOP FUNCTIONS
# ============================================

stop_backend() {
    log_info "Stopping backend..."
    pkill -f "node.*server.js" 2>/dev/null || true
    pkill -f "nodemon.*server.js" 2>/dev/null || true
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    rm -f "$PID_DIR/backend.pid"
    log_success "Backend stopped"
}

stop_bot() {
    log_info "Stopping bot..."
    pkill -f "node.*bot.js" 2>/dev/null || true
    pkill -f "nodemon.*bot" 2>/dev/null || true
    rm -f "$PID_DIR/bot.pid"
    log_success "Bot stopped"
}

stop_webapp() {
    log_info "Stopping webapp..."
    pkill -f "vite" 2>/dev/null || true
    lsof -ti :5173 | xargs kill -9 2>/dev/null || true
    rm -f "$PID_DIR/webapp.pid"
    log_success "Webapp stopped"
}

stop_tunnel() {
    log_info "Stopping tunnel..."
    pkill -f "cloudflared" 2>/dev/null || true
    rm -f "$PID_DIR/tunnel.pid"
    rm -f "$PROJECT_DIR/.tunnel_url"
    log_success "Tunnel stopped"
}

stop_all() {
    echo ""
    echo "========================================"
    echo "  Stopping all services..."
    echo "========================================"
    echo ""

    stop_tunnel
    stop_bot
    stop_backend
    stop_webapp

    # Extra cleanup
    sleep 1

    echo ""
    log_success "All services stopped"
}

# ============================================
# START FUNCTIONS
# ============================================

start_backend() {
    log_info "Starting backend on port 3000..."
    cd "$BACKEND_DIR"

    # Start in background, redirect output to log
    node src/server.js > "$PROJECT_DIR/.logs/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"

    # Wait for startup
    sleep 3

    if lsof -i :3000 > /dev/null 2>&1; then
        log_success "Backend running on http://localhost:3000"
    else
        log_error "Backend failed to start! Check .logs/backend.log"
        return 1
    fi
}

start_bot() {
    log_info "Starting Telegram bot..."
    cd "$BOT_DIR"

    node src/bot.js > "$PROJECT_DIR/.logs/bot.log" 2>&1 &
    echo $! > "$PID_DIR/bot.pid"

    sleep 2

    if ps -p "$(cat "$PID_DIR/bot.pid" 2>/dev/null)" > /dev/null 2>&1; then
        log_success "Bot running (PID: $(cat "$PID_DIR/bot.pid"))"
    else
        log_error "Bot failed to start! Check .logs/bot.log"
        return 1
    fi
}

start_webapp() {
    log_info "Starting webapp on port 5173..."
    cd "$WEBAPP_DIR"

    npm run dev > "$PROJECT_DIR/.logs/webapp.log" 2>&1 &
    echo $! > "$PID_DIR/webapp.pid"

    sleep 3

    if lsof -i :5173 > /dev/null 2>&1; then
        log_success "Webapp running on http://localhost:5173"
    else
        log_error "Webapp failed to start! Check .logs/webapp.log"
        return 1
    fi
}

start_tunnel() {
    log_info "Starting Cloudflare tunnel..."

    # Start tunnel and capture URL
    cloudflared tunnel --url http://localhost:5173 > "$PROJECT_DIR/.logs/tunnel.log" 2>&1 &
    echo $! > "$PID_DIR/tunnel.pid"

    # Wait for tunnel URL
    log_info "Waiting for tunnel URL..."
    sleep 5

    # Extract URL from log
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$PROJECT_DIR/.logs/tunnel.log" | head -1)

    if [ -n "$TUNNEL_URL" ]; then
        echo "$TUNNEL_URL" > "$PROJECT_DIR/.tunnel_url"
        log_success "Tunnel: $TUNNEL_URL"

        # Update .env files
        update_env_files "$TUNNEL_URL"

        # Update Telegram Menu Button automatically
        update_bot_menu_button "$TUNNEL_URL"
    else
        log_warn "Could not extract tunnel URL. Check .logs/tunnel.log"
        log_info "Tunnel may still be starting..."
    fi
}

update_bot_menu_button() {
    local URL=$1
    local BOT_TOKEN=$(grep "^BOT_TOKEN=" "$BOT_DIR/.env" | cut -d'=' -f2)

    if [ -n "$BOT_TOKEN" ]; then
        log_info "Updating Telegram Menu Button..."

        # Set default menu button for all chats
        curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setChatMenuButton" \
            -H "Content-Type: application/json" \
            -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Open Shop\",\"web_app\":{\"url\":\"$URL\"}}}" \
            > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            log_success "Telegram Menu Button updated!"
        else
            log_warn "Failed to update Menu Button"
        fi
    fi
}

update_env_files() {
    local URL=$1
    log_info "Updating .env files with tunnel URL..."

    # Update backend/.env
    if [ -f "$BACKEND_DIR/.env" ]; then
        sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$URL|g" "$BACKEND_DIR/.env"
        sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$URL|g" "$BACKEND_DIR/.env"
    fi

    # Update bot/.env
    if [ -f "$BOT_DIR/.env" ]; then
        sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$URL|g" "$BOT_DIR/.env"
    fi

    log_success "Environment files updated"
}

start_all() {
    echo ""
    echo "========================================"
    echo "  Starting Status Stock 4.0"
    echo "========================================"
    echo ""

    # Create logs directory
    mkdir -p "$PROJECT_DIR/.logs"

    # Stop any existing processes first
    stop_all
    sleep 2

    echo ""
    echo "Starting services..."
    echo ""

    start_webapp
    start_backend
    start_bot
    start_tunnel

    echo ""
    echo "========================================"
    echo "  All services started!"
    echo "========================================"
    echo ""

    show_status

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [ -f "$PROJECT_DIR/.tunnel_url" ]; then
        echo -e "  ${GREEN}Tunnel URL:${NC} $(cat "$PROJECT_DIR/.tunnel_url")"
        echo ""
        echo "  Update BotFather Menu Button with this URL!"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ============================================
# STATUS & LOGS
# ============================================

show_status() {
    echo ""
    echo "Service Status:"
    echo "───────────────────────────────────────"

    # Backend
    if lsof -i :3000 > /dev/null 2>&1; then
        echo -e "  Backend:  ${GREEN}● Running${NC} (port 3000)"
    else
        echo -e "  Backend:  ${RED}○ Stopped${NC}"
    fi

    # Webapp
    if lsof -i :5173 > /dev/null 2>&1; then
        echo -e "  Webapp:   ${GREEN}● Running${NC} (port 5173)"
    else
        echo -e "  Webapp:   ${RED}○ Stopped${NC}"
    fi

    # Bot
    if pgrep -f "node.*bot.js" > /dev/null 2>&1; then
        echo -e "  Bot:      ${GREEN}● Running${NC}"
    else
        echo -e "  Bot:      ${RED}○ Stopped${NC}"
    fi

    # Tunnel
    if pgrep -f "cloudflared" > /dev/null 2>&1; then
        if [ -f "$PROJECT_DIR/.tunnel_url" ]; then
            echo -e "  Tunnel:   ${GREEN}● Active${NC}"
        else
            echo -e "  Tunnel:   ${YELLOW}● Starting${NC}"
        fi
    else
        echo -e "  Tunnel:   ${RED}○ Stopped${NC}"
    fi

    echo "───────────────────────────────────────"
}

show_logs() {
    echo ""
    echo "Recent logs (last 20 lines each):"
    echo ""

    if [ -f "$PROJECT_DIR/.logs/backend.log" ]; then
        echo "=== Backend ==="
        tail -20 "$PROJECT_DIR/.logs/backend.log"
        echo ""
    fi

    if [ -f "$PROJECT_DIR/.logs/bot.log" ]; then
        echo "=== Bot ==="
        tail -20 "$PROJECT_DIR/.logs/bot.log"
        echo ""
    fi

    if [ -f "$PROJECT_DIR/.logs/tunnel.log" ]; then
        echo "=== Tunnel ==="
        tail -10 "$PROJECT_DIR/.logs/tunnel.log"
        echo ""
    fi
}

restart_tunnel_only() {
    echo ""
    log_info "Restarting tunnel only (new URL)..."
    stop_tunnel
    sleep 2
    start_tunnel

    echo ""
    if [ -f "$PROJECT_DIR/.tunnel_url" ]; then
        echo -e "${GREEN}New Tunnel URL:${NC} $(cat "$PROJECT_DIR/.tunnel_url")"
        echo ""
        echo "Don't forget to update BotFather!"
    fi
}

# ============================================
# MAIN
# ============================================

case "${1:-start}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        start_all
        ;;
    status)
        show_status
        if [ -f "$PROJECT_DIR/.tunnel_url" ]; then
            echo ""
            echo "Tunnel URL: $(cat "$PROJECT_DIR/.tunnel_url")"
        fi
        ;;
    logs)
        show_logs
        ;;
    tunnel)
        restart_tunnel_only
        ;;
    *)
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs|tunnel}"
        echo ""
        echo "Commands:"
        echo "  start   - Start all services (backend, bot, webapp, tunnel)"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  status  - Show service status"
        echo "  logs    - Show recent logs"
        echo "  tunnel  - Restart only tunnel (get new URL)"
        echo ""
        exit 1
        ;;
esac
