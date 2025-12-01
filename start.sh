#!/bin/bash

#############################################
# Telegram Shop - Full Stack Startup Script
# Автоматический запуск Backend + Bot + Cloudflare Tunnel
#############################################

set -e  # Exit on error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create logs directory
mkdir -p "$LOG_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║     🚀 Telegram Shop - Full Stack Startup         ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

#############################################
# Step 1: Kill ALL existing processes
#############################################
echo -e "${YELLOW}[1/6]${NC} Stopping ALL existing processes..."

# Kill backend processes
echo "  ├─ Backend processes..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "nodemon.*server" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Kill bot processes
echo "  ├─ Bot processes..."
pkill -f "node.*bot.js" 2>/dev/null || true
pkill -f "nodemon.*bot" 2>/dev/null || true

# Kill webapp dev server
echo "  ├─ Webapp processes..."
pkill -f "vite" 2>/dev/null || true

# Kill cloudflared
echo "  ├─ cloudflared..."
pkill -x cloudflared 2>/dev/null || true

sleep 2

# Verify cleanup
REMAINING=$(ps aux | grep -E "node.*(server|bot)|nodemon|vite|cloudflared" | grep -v grep | grep -v mcp-server | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo -e "  ${YELLOW}!${NC} Warning: $REMAINING project processes still running"
else
  echo -e "  ${GREEN}✓${NC} All project processes stopped"
fi

# Check if services already running (prevent duplicates)
if lsof -ti:3000 >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Backend already running on port 3000"
  echo -e "  ${YELLOW}!${NC} Run ${BLUE}./stop.sh${NC} first, then restart"
  exit 1
fi

if pgrep -f "node.*bot.js" >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Bot already running"
  echo -e "  ${YELLOW}!${NC} Run ${BLUE}./stop.sh${NC} first, then restart"
  exit 1
fi

echo ""

#############################################
# Step 2: Start Cloudflare Quick Tunnel
#############################################
echo -e "${YELLOW}[2/6]${NC} Starting Cloudflare tunnel..."

cloudflared tunnel --url http://localhost:3000 > "$LOG_DIR/cloudflared.log" 2>&1 &
CLOUDFLARED_PID=$!
echo $CLOUDFLARED_PID > "$PROJECT_ROOT/.cloudflared.pid"

# Wait for cloudflared to start
echo "  └─ Waiting for cloudflared to initialize..."
sleep 5

# Get Cloudflare URL from logs
TUNNEL_URL=""
for i in {1..15}; do
  if TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_DIR/cloudflared.log" | head -1); then
    if [ -n "$TUNNEL_URL" ]; then
      echo -e "  ${GREEN}✓${NC} Cloudflare URL: ${GREEN}$TUNNEL_URL${NC}"
      break
    fi
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo -e "  ${RED}✗${NC} Failed to get Cloudflare tunnel URL"
  echo -e "  ${YELLOW}!${NC} Check if cloudflared is installed: ${BLUE}brew install cloudflared${NC}"
  echo -e "  ${YELLOW}!${NC} Check logs: ${BLUE}cat $LOG_DIR/cloudflared.log${NC}"
  exit 1
fi

echo ""

#############################################
# Step 3: Update .env files with tunnel URL
#############################################
echo -e "${YELLOW}[3/6]${NC} Updating configuration files..."

# Update backend/.env
if [ -f "$PROJECT_ROOT/backend/.env" ]; then
  sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$TUNNEL_URL|g" "$PROJECT_ROOT/backend/.env"
  sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|g" "$PROJECT_ROOT/backend/.env"
  sed -i '' "s|CRYSTALPAY_CALLBACK_URL=.*|CRYSTALPAY_CALLBACK_URL=$TUNNEL_URL/api/webhooks/crystalpay|g" "$PROJECT_ROOT/backend/.env"
  echo -e "  ${GREEN}✓${NC} Updated backend/.env"
else
  echo -e "  ${RED}✗${NC} backend/.env not found"
  exit 1
fi

# Update bot/.env
if [ -f "$PROJECT_ROOT/bot/.env" ]; then
  sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|g" "$PROJECT_ROOT/bot/.env"
  echo -e "  ${GREEN}✓${NC} Updated bot/.env"
else
  echo -e "  ${RED}✗${NC} bot/.env not found"
  exit 1
fi

# Update webapp/.env
if [ -f "$PROJECT_ROOT/webapp/.env" ]; then
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|g" "$PROJECT_ROOT/webapp/.env"
  echo -e "  ${GREEN}✓${NC} Updated webapp/.env"
else
  echo -e "  ${RED}✗${NC} webapp/.env not found"
  exit 1
fi

# Update webapp/.env.production (Vite uses this for production builds!)
if [ -f "$PROJECT_ROOT/webapp/.env.production" ]; then
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|g" "$PROJECT_ROOT/webapp/.env.production"
  echo -e "  ${GREEN}✓${NC} Updated webapp/.env.production"
fi

# Validate that webapp API URL is correct before building
WEBAPP_API_URL=$(grep '^VITE_API_URL=' "$PROJECT_ROOT/webapp/.env.production" | cut -d'=' -f2-)
if [[ -z "$WEBAPP_API_URL" ]]; then
  echo -e "  ${RED}✗${NC} VITE_API_URL is empty in webapp/.env.production"
  exit 1
fi

if [[ "$WEBAPP_API_URL" != *"/api" ]]; then
  WEBAPP_API_URL="${WEBAPP_API_URL%/}/api"
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$WEBAPP_API_URL|g" "$PROJECT_ROOT/webapp/.env"
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$WEBAPP_API_URL|g" "$PROJECT_ROOT/webapp/.env.production"
  echo -e "  ${YELLOW}!${NC} Normalized webapp API URL to include /api: ${BLUE}$WEBAPP_API_URL${NC}"
fi

echo -e "  └─ Webapp API URL: ${BLUE}$WEBAPP_API_URL${NC}"

echo ""

#############################################
# Step 4: Rebuild webapp with new URL
#############################################
echo -e "${YELLOW}[4/6]${NC} Rebuilding webapp..."

cd "$PROJECT_ROOT/webapp"
npm run build > "$LOG_DIR/webapp-build.log" 2>&1

if [ $? -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC} Webapp built successfully"
else
  echo -e "  ${RED}✗${NC} Webapp build failed"
  echo -e "  ${YELLOW}!${NC} Check logs: ${BLUE}cat $LOG_DIR/webapp-build.log${NC}"
  exit 1
fi

echo ""

#############################################
# Step 5: Start Backend
#############################################
echo -e "${YELLOW}[5/6]${NC} Starting Backend..."

cd "$PROJECT_ROOT/backend"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PROJECT_ROOT/.backend.pid"

echo "  └─ Waiting for backend to initialize..."
sleep 5

# Check if backend started successfully
if lsof -ti:3000 >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Backend running on port 3000"
else
  echo -e "  ${RED}✗${NC} Backend failed to start"
  echo -e "  ${YELLOW}!${NC} Check logs: ${BLUE}tail -f $LOG_DIR/backend.log${NC}"
  exit 1
fi

echo ""

#############################################
# Step 6: Start Telegram Bot
#############################################
echo -e "${YELLOW}[6/6]${NC} Starting Telegram Bot..."

cd "$PROJECT_ROOT/bot"
npm start > "$LOG_DIR/bot.log" 2>&1 &
BOT_PID=$!
echo $BOT_PID > "$PROJECT_ROOT/.bot.pid"

echo "  └─ Waiting for bot to initialize..."
sleep 3

# Check logs for bot startup
if grep -q "Bot started successfully" "$LOG_DIR/bot.log" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Telegram Bot started"
else
  echo -e "  ${YELLOW}!${NC} Bot may not have started - check logs"
fi

echo ""

#############################################
# Summary
#############################################
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   🎉 READY!                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Services:${NC}"
echo -e "  ├─ Backend API:     ${BLUE}http://localhost:3000/api${NC}"
echo -e "  ├─ WebApp (tunnel): ${BLUE}$TUNNEL_URL${NC}"
echo -e "  └─ Health Check:    ${BLUE}http://localhost:3000/health${NC}"
echo ""
echo -e "${GREEN}Logs:${NC}"
echo -e "  ├─ Backend:     ${BLUE}tail -f $LOG_DIR/backend.log${NC}"
echo -e "  ├─ Bot:         ${BLUE}tail -f $LOG_DIR/bot.log${NC}"
echo -e "  ├─ Webapp:      ${BLUE}cat $LOG_DIR/webapp-build.log${NC}"
echo -e "  └─ Cloudflare:  ${BLUE}tail -f $LOG_DIR/cloudflared.log${NC}"
echo ""
echo -e "${GREEN}Process IDs:${NC}"
echo -e "  ├─ Cloudflare:  ${BLUE}$CLOUDFLARED_PID${NC}"
echo -e "  ├─ Backend:     ${BLUE}$BACKEND_PID${NC}"
echo -e "  └─ Bot:         ${BLUE}$BOT_PID${NC}"
echo ""
echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  ${BLUE}./stop.sh${NC}"
echo ""
echo -e "${GREEN}Telegram Bot:${NC}"
echo -e "  └─ Open Telegram → Find your bot → Click Menu Button${NC}"
echo ""
