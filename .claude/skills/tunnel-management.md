---
name: tunnel-management
description: Manage Cloudflare tunnel - check status, get URL, restart tunnel, update .env files. Use when tunnel disconnects or after system sleep.
---

# Cloudflare Tunnel Management Skill

Manage Cloudflare tunnel for Telegram Mini App connectivity.

## What this skill does:

1. Checks cloudflared status and public URL
2. Restarts disconnected tunnels
3. Updates .env files with new tunnel URL
4. Rebuilds webapp with new URL
5. Verifies tunnel is working

## Usage:

Say: **"check tunnel"** or **"restart tunnel"** or **"tunnel status"** or **"cloudflare status"**

## Commands:

### Check tunnel status:

```bash
echo "=== Cloudflare Tunnel Status ==="
echo ""

# Check if cloudflared is running
if pgrep -f cloudflared >/dev/null 2>&1; then
  echo "✅ cloudflared process is running"
  
  # Get PID
  PID=$(pgrep -f "cloudflared tunnel")
  echo "   PID: $PID"
  
  # Get URL from log
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /Users/sile/Documents/Status\ Stock\ 4.0/logs/cloudflared.log 2>/dev/null | tail -1)
  
  if [ -n "$TUNNEL_URL" ]; then
    echo "✅ Public URL: $TUNNEL_URL"
    
    # Check if URL is responding
    if curl -s --head --max-time 5 "$TUNNEL_URL" | grep -q "HTTP"; then
      echo "✅ Tunnel is responding to requests"
    else
      echo "⚠️  Tunnel URL not responding"
    fi
  else
    echo "⚠️  Running but URL not found in logs"
    echo "   Try: tail logs/cloudflared.log"
  fi
else
  echo "❌ cloudflared is NOT running"
  echo ""
  echo "CRITICAL: Mini App won't work without tunnel!"
  echo "Solution: Start with 'quick start' or 'restart all'"
fi

echo ""
echo "=== End of Status ==="
```

### Restart tunnel only:

```bash
PROJECT_DIR="/Users/sile/Documents/Status Stock 4.0"
cd "$PROJECT_DIR"

echo "🔄 Restarting Cloudflare tunnel..."

# Stop existing tunnel
pkill -f cloudflared 2>/dev/null
sleep 2

# Start new tunnel
cloudflared tunnel --url http://localhost:3000 > logs/cloudflared.log 2>&1 &
sleep 5

# Get new URL
TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' logs/cloudflared.log | head -1)

if [ -n "$TUNNEL_URL" ]; then
  echo "✅ New tunnel URL: $TUNNEL_URL"
  
  # Update .env files
  sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" backend/.env
  sed -i '' "s|FRONTEND_URL=.*|FRONTEND_URL=$TUNNEL_URL|" backend/.env
  sed -i '' "s|WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" bot/.env
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env
  sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$TUNNEL_URL/api|" webapp/.env.production
  
  echo "✅ .env files updated"
  
  # Rebuild webapp
  cd webapp && npm run build > ../logs/webapp-build.log 2>&1 && cd ..
  echo "✅ Webapp rebuilt"
  
  # Note: Backend/Bot need restart to pick up new URL
  echo ""
  echo "⚠️  Backend and Bot need restart to use new URL"
  echo "   Run: 'restart all' for full restart"
else
  echo "❌ Failed to get tunnel URL"
  cat logs/cloudflared.log
fi
```

### Get current tunnel URL:

```bash
TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /Users/sile/Documents/Status\ Stock\ 4.0/logs/cloudflared.log 2>/dev/null | tail -1)

if [ -n "$TUNNEL_URL" ]; then
  echo "Current tunnel URL: $TUNNEL_URL"
  
  echo ""
  echo "Configured in:"
  grep -l "$TUNNEL_URL" /Users/sile/Documents/Status\ Stock\ 4.0/*/.env 2>/dev/null | while read f; do
    echo "  ✅ $f"
  done
else
  echo "❌ No tunnel URL found. cloudflared may not be running."
fi
```

## Why Cloudflare tunnel (not ngrok):

| Feature | Cloudflare | ngrok (free) |
|---------|------------|--------------|
| Session limit | None | 2 hours |
| Request limit | None | 40/min |
| Registration | Not required | Required |
| Speed | Fast (global CDN) | Good |

## Common tunnel issues:

### Issue 1: Tunnel disconnected

```
Symptom: Mini App not loading, connection refused
Cause: cloudflared process died or network issue
Solution: Run 'restart tunnel' or 'restart all'
```

### Issue 2: After system sleep

```
Symptom: Backend running but Mini App inaccessible
Cause: Tunnel dies when system sleeps
Solution: Restart tunnel with 'restart all'
```

### Issue 3: Wrong URL in .env

```
Symptom: API calls fail with 404, CORS errors
Cause: .env files have old tunnel URL
Solution: Restart tunnel (updates all .env files)
```

## Tunnel URL pattern:

Cloudflare quick tunnels generate URLs like:
- `https://random-words-here.trycloudflare.com`

URL changes every time you restart cloudflared.

## Files updated when tunnel restarts:

1. **backend/.env** - WEBAPP_URL, FRONTEND_URL
2. **bot/.env** - WEBAPP_URL
3. **webapp/.env** - VITE_API_URL
4. **webapp/.env.production** - VITE_API_URL

## When to use:

- 🌐 After system sleep/wake
- 🌐 When Mini App not loading
- 🌐 After "connection refused" errors
- 🌐 When testing from real Telegram app
- 🌐 Before sharing bot with testers
