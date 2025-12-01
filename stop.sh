#!/bin/bash

#############################################
# Telegram Shop - Stop All Services
# Останавливает Backend + Bot + Webapp + Cloudflare
#############################################

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║     🛑 Telegram Shop - Stopping All Services      ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Stopping processes...${NC}"

# Stop by PID files (if they exist)
if [ -f "$PROJECT_ROOT/.backend.pid" ]; then
  echo "  ├─ Backend (by PID)..."
  kill $(cat "$PROJECT_ROOT/.backend.pid") 2>/dev/null || true
  rm -f "$PROJECT_ROOT/.backend.pid"
fi

if [ -f "$PROJECT_ROOT/.bot.pid" ]; then
  echo "  ├─ Bot (by PID)..."
  kill $(cat "$PROJECT_ROOT/.bot.pid") 2>/dev/null || true
  rm -f "$PROJECT_ROOT/.bot.pid"
fi

if [ -f "$PROJECT_ROOT/.cloudflared.pid" ]; then
  echo "  ├─ Cloudflare (by PID)..."
  kill $(cat "$PROJECT_ROOT/.cloudflared.pid") 2>/dev/null || true
  rm -f "$PROJECT_ROOT/.cloudflared.pid"
fi

# Also remove old ngrok pid if exists
if [ -f "$PROJECT_ROOT/.ngrok.pid" ]; then
  echo "  ├─ Cleaning up old ngrok PID file..."
  rm -f "$PROJECT_ROOT/.ngrok.pid"
fi

# Fallback: kill by pattern (if PID files don't exist)
echo "  ├─ Fallback cleanup..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "nodemon.*server" 2>/dev/null || true
pkill -f "node.*bot.js" 2>/dev/null || true
pkill -f "nodemon.*bot" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -x cloudflared 2>/dev/null || true

sleep 2

echo ""

# Verify cleanup
REMAINING=$(ps aux | grep -E "node.*(server|bot)|nodemon|vite|cloudflared" | grep -v grep | grep -v mcp-server | wc -l)
if [ "$REMAINING" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Warning: $REMAINING project processes still running${NC}"
  echo ""
  echo -e "${BLUE}Active processes:${NC}"
  ps aux | grep -E "node.*(server|bot)|nodemon|vite|cloudflared" | grep -v grep | grep -v mcp-server
  echo ""
  echo -e "${YELLOW}Tip: Try running this script again or manually kill with:${NC}"
  echo -e "  ${BLUE}kill -9 <PID>${NC}"
else
  echo -e "${GREEN}✅ All Telegram Shop processes stopped${NC}"
  echo ""
  echo -e "${BLUE}Verify with:${NC}"
  echo -e "  ${BLUE}lsof -ti:3000${NC}        # Should return nothing"
  echo -e "  ${BLUE}pgrep cloudflared${NC}    # Should return nothing"
fi

echo ""
