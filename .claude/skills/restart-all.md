---
name: restart-all
description: Safely restart Backend, Bot, WebApp with Cloudflare tunnel. Use after code changes or when services hang.
---

# Restart All Skill

Safely restart all services with fresh Cloudflare tunnel.

## What this skill does:

1. Stops all services (backend, bot, cloudflared)
2. Waits for clean shutdown
3. Starts fresh cloudflared tunnel
4. Updates .env files with new tunnel URL
5. Rebuilds webapp
6. Starts Backend + Bot

## Usage:

Say: **"restart all"** or **"restart everything"** or **"reboot"** or **"restart services"**

## Commands:

```bash
PROJECT_DIR="/Users/sile/Documents/Status Stock 4.0"
cd "$PROJECT_DIR"

echo "🔄 Restarting all services..."

# 1. Stop all services
pkill -f cloudflared 2>/dev/null
pkill -f "node.*backend" 2>/dev/null
pkill -f "node.*bot" 2>/dev/null
echo "✓ Stopped existing processes"

sleep 3

# 2. Verify ports are free
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "⚠️  Port 3000 still occupied. Force killing..."
  lsof -ti:3000 | xargs kill -9
fi

# 3. Start cloudflared tunnel
echo "🚀 Starting Cloudflare tunnel..."
cloudflared tunnel --url http://localhost:3000 > logs/cloudflared.log 2>&1 &
sleep 5

# 4. Get tunnel URL
TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' logs/cloudflared.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Failed to get cloudflared URL. Check logs/cloudflared.log"
  exit 1
fi

echo "✅ Tunnel: $TUNNEL_URL"

# 5. Update .env files
sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" backend/.env
sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$TUNNEL_URL|" backend/.env
sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" bot/.env
sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env
sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env.production

# 6. Rebuild webapp
echo "📦 Rebuilding webapp..."
cd webapp && npm run build > ../logs/webapp-build.log 2>&1 && cd ..

# 7. Start Backend
echo "🔧 Starting Backend..."
cd backend && npm run dev > ../logs/backend.log 2>&1 &
cd ..
sleep 3

# 8. Start Bot
echo "🤖 Starting Bot..."
cd bot && npm start > ../logs/bot.log 2>&1 &
cd ..
sleep 2

# 9. Verify
echo ""
echo "╔════════════════════════════════════╗"
echo "║        ✅ RESTART COMPLETE         ║"
echo "╠════════════════════════════════════╣"
echo "║ Tunnel: $TUNNEL_URL"
echo "║ Backend: http://localhost:3000     ║"
echo "║ Logs: logs/                        ║"
echo "╚════════════════════════════════════╝"
```

## Safety features:

- ✅ Clean shutdown before restart
- ✅ Port verification
- ✅ Fresh tunnel URL on each restart
- ✅ Automatic .env updates

## When to use:

- 🔄 After code changes (backend, bot, or webapp)
- 🔄 When services are unresponsive
- 🔄 After config changes (.env files)
- 🔄 When tunnel disconnected
- 🔄 After merge conflicts

## Verify restart:

```bash
# Check backend health
curl http://localhost:3000/health

# Check tunnel
curl -I $TUNNEL_URL

# Watch logs
tail -f logs/backend.log logs/bot.log
```
