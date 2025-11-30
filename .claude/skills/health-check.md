---
name: health-check
description: Check Backend API health, Bot process, Cloudflare tunnel status, PostgreSQL connection, recent errors. Use before starting work, after deployment, or when suspecting issues.
---

# Health Check Skill

Perform a comprehensive health check of the entire Status Stock 4.0 stack.

## What this skill does:

1. Checks Backend API health endpoint
2. Checks Bot process status
3. Checks Cloudflare tunnel and public URL
4. Checks PostgreSQL connection
5. Checks port availability
6. Scans recent error logs
7. Generates health report

## Usage:

Say: **"health check"** or **"check everything"** or **"status"** or **"are we healthy"**

## Commands:

```bash
PROJECT_DIR="/Users/sile/Documents/Status Stock 4.0"

echo "╔════════════════════════════════════╗"
echo "║      HEALTH CHECK REPORT           ║"
echo "╚════════════════════════════════════╝"
echo ""

# 1. Backend
echo "1. Backend (port 3000):"
if lsof -ti:3000 >/dev/null 2>&1; then
  if curl -s http://localhost:3000/health | grep -q "success\|ok\|healthy"; then
    echo "   ✅ Healthy"
  else
    echo "   ⚠️  Running but health check failed"
  fi
else
  echo "   ❌ Not running"
fi

# 2. Telegram Bot
echo "2. Telegram Bot:"
if ps aux | grep "node.*bot" | grep -v grep >/dev/null; then
  echo "   ✅ Running"
else
  echo "   ❌ Not running"
fi

# 3. Cloudflare Tunnel
echo "3. Cloudflare Tunnel:"
if pgrep -f cloudflared >/dev/null 2>&1; then
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$PROJECT_DIR/logs/cloudflared.log" 2>/dev/null | tail -1)
  if [ -n "$TUNNEL_URL" ]; then
    echo "   ✅ Active: $TUNNEL_URL"
  else
    echo "   ⚠️  Running but URL not found"
  fi
else
  echo "   ❌ Not running (CRITICAL - Mini App won't work!)"
fi

# 4. PostgreSQL
echo "4. PostgreSQL:"
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "   ✅ Connected"
  if psql -d telegram_shop -c "SELECT 1" >/dev/null 2>&1; then
    echo "   ✅ Database 'telegram_shop' accessible"
  else
    echo "   ⚠️  Connected but database not accessible"
  fi
else
  echo "   ❌ Not connected"
fi

# 5. Recent errors
echo "5. Recent errors:"

# Backend errors
backend_log="$PROJECT_DIR/logs/backend.log"
if [ -f "$backend_log" ]; then
  backend_errors=$(tail -100 "$backend_log" 2>/dev/null | grep -ci error)
  echo "   Backend: $backend_errors errors (last 100 lines)"
else
  echo "   Backend: No log file"
fi

# Bot errors
bot_log="$PROJECT_DIR/logs/bot.log"
if [ -f "$bot_log" ]; then
  bot_errors=$(tail -100 "$bot_log" 2>/dev/null | grep -ci error)
  echo "   Bot: $bot_errors errors (last 100 lines)"
else
  echo "   Bot: No log file"
fi

# 6. Port check
echo "6. Ports:"
for port in 3000 5432; do
  if lsof -ti:$port >/dev/null 2>&1; then
    echo "   Port $port: ✅ In use"
  else
    echo "   Port $port: ❌ Free"
  fi
done

echo ""
echo "════════════════════════════════════"
```

## Health criteria:

- ✅ **Green:** All services running, tunnel active, no errors
- ⚠️ **Yellow:** Services running but have errors or tunnel issues
- ❌ **Red:** Critical services down (Backend, Bot, PostgreSQL, Tunnel)

## Critical checks:

1. **Cloudflare Tunnel MUST be running** - Without it, Mini App won't work
2. **Backend MUST respond to /health** - API must be functional
3. **PostgreSQL MUST be connected** - Database operations will fail otherwise
4. **Bot MUST be running** - Users can't interact with the shop

## Automatic actions:

If unhealthy, Claude will:

1. Show detailed error logs
2. Identify missing services
3. Suggest specific fixes
4. Optionally restart services

## When to use:

- 🏥 Before starting work (morning check)
- 🏥 After deployment or restart
- 🏥 When suspecting issues
- 🏥 After system wake from sleep
- 🏥 Before testing new features

## Quick fix commands:

If tunnel is down:

```bash
# Full restart with fresh tunnel
pkill -f cloudflared; pkill -f "node.*backend"; pkill -f "node.*bot"
# Then run 'quick start'
```

If PostgreSQL is down:

```bash
brew services start postgresql@14
```

If Backend/Bot down but tunnel OK:

```bash
cd backend && npm run dev &  # Backend only
cd bot && npm start &        # Bot only
```
