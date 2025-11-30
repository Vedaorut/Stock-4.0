---
name: quick-start
description: Start Backend, Bot, WebApp with Cloudflare tunnel. Use when starting project, after git pull, or morning startup.
---

# Quick Start Skill

Instantly start the entire Status Stock 4.0 stack with Cloudflare tunnel.

## What this skill does:

1. Stops all existing processes (backend, bot, webapp, cloudflared)
2. Starts cloudflared tunnel and gets public URL
3. Updates .env files in backend/bot/webapp with tunnel URL
4. Rebuilds webapp with new URL
5. Starts Backend on port 3000
6. Starts Telegram Bot
7. Monitors logs for errors

## Usage:

Simply say: **"quick start"** or **"start everything"** or **"start project"**

## Commands:

```bash
PROJECT_DIR="/Users/sile/Documents/Status Stock 4.0"
cd "$PROJECT_DIR"

# 1. Stop existing processes
pkill -f cloudflared 2>/dev/null
pkill -f "node.*backend" 2>/dev/null
pkill -f "node.*bot" 2>/dev/null
sleep 2

# 2. Start cloudflared tunnel
cloudflared tunnel --url http://localhost:3000 > logs/cloudflared.log 2>&1 &
sleep 5

# 3. Get tunnel URL from cloudflared output
TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' logs/cloudflared.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Failed to get cloudflared URL"
  cat logs/cloudflared.log
  exit 1
fi

echo "✅ Cloudflare Tunnel: $TUNNEL_URL"

# 4. Update .env files
sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" backend/.env
sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$TUNNEL_URL|" backend/.env
sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" bot/.env
sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env
sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env.production

# 5. Rebuild webapp
cd webapp && npm run build > ../logs/webapp-build.log 2>&1
cd ..

# 6. Start Backend
cd backend && npm run dev > ../logs/backend.log 2>&1 &
cd ..
sleep 3

# 7. Start Bot
cd bot && npm start > ../logs/bot.log 2>&1 &
cd ..
sleep 2

echo ""
echo "✅ All services started!"
echo "   Tunnel: $TUNNEL_URL"
echo "   Backend: http://localhost:3000"
echo "   Logs: logs/"
```

## Success indicators:

- ✅ **Cloudflare:** URL like https://xxx-xxx.trycloudflare.com
- ✅ **Backend:** "Server running on port 3000"
- ✅ **Bot:** "Bot started successfully"
- ✅ **Webapp:** Built successfully with new tunnel URL

## Logs location:

- Cloudflared: `logs/cloudflared.log`
- Backend: `logs/backend.log`
- Bot: `logs/bot.log`
- Webapp build: `logs/webapp-build.log`

## Why Cloudflare (not ngrok):

- ✅ **No session limits** - ngrok free tier expires after 2 hours
- ✅ **No registration required** - cloudflared quick tunnel works out of the box
- ✅ **Faster** - Cloudflare's network is optimized globally
- ✅ **No rate limits** - ngrok free tier has request limits

## When to use:

- ⚡ First launch after cloning
- ⚡ Morning startup
- ⚡ After pulling new changes
- ⚡ After system reboot
- ⚡ When tunnel URL changed

## Important:

This project **REQUIRES** an HTTPS tunnel for Telegram Mini App to work. Always use cloudflared tunnel for local development.
