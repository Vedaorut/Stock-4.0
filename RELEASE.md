# Release Checklist - Status Stock 4.0

This document provides the complete release checklist with verification commands.

## Pre-Release Checks

### 1. Environment Variables

Ensure all required environment variables are set:

```bash
# Backend (.env)
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/telegram_shop
JWT_SECRET=<32+ chars>          # openssl rand -base64 32
TELEGRAM_BOT_TOKEN=<from BotFather>
INTERNAL_SECRET=<shared with bot>
REDIS_URL=redis://:password@host:6379  # Production MUST have password

# Bot (.env)
BOT_TOKEN=<from BotFather>
BACKEND_URL=https://your-backend.com
WEBAPP_URL=https://your-webapp.com
INTERNAL_SECRET=<same as backend>
REDIS_URL=redis://:password@host:6379
SESSION_ENCRYPTION_KEY=<32+ chars>  # openssl rand -base64 32  [NEW]

# WebApp (.env)
VITE_API_URL=https://your-backend.com/api
```

### 2. Generate Encryption Keys

```bash
# Generate SESSION_ENCRYPTION_KEY for bot
openssl rand -base64 32

# Generate JWT_SECRET for backend (if not set)
openssl rand -base64 32
```

---

## Verification Commands

### Lint Check

```bash
# Backend
cd backend && npm run lint
# Expected: No errors

# Bot
cd bot && npm run lint
# Expected: No errors

# WebApp
cd webapp && npm run lint
# Expected: No errors
```

### Run Tests

```bash
# Backend tests
cd backend && npm test
# Expected: All tests pass

# Bot tests
cd bot && npm test
# Expected: All tests pass

# Session encryption tests specifically
cd bot && npm test -- tests/unit/sessionCrypto.test.js
# Expected: 19 tests pass
```

### Build Check

```bash
# WebApp production build
cd webapp && npm run build
# Expected: Build completes without errors
```

---

## Security Checklist

### Redis Security (CRITICAL)

- [ ] Redis has authentication enabled (`requirepass`)
- [ ] Redis is not exposed to public internet
- [ ] Redis uses TLS for remote connections (recommended)
- [ ] `SESSION_ENCRYPTION_KEY` is set in production

```bash
# Verify Redis auth is required
redis-cli -h your-redis-host ping
# Should fail without password

redis-cli -h your-redis-host -a your-password ping
# Should return PONG
```

### Session Encryption

- [ ] `SESSION_ENCRYPTION_KEY` environment variable is set
- [ ] Key is at least 32 characters
- [ ] Key is stored securely (AWS Secrets Manager, etc.)

**Security Notes:**
- Without `SESSION_ENCRYPTION_KEY`, sessions are stored in plaintext (backward compatible but not recommended)
- If key is changed, existing sessions will fail to decrypt and users will re-authenticate automatically
- Session data is encrypted with AES-256-GCM (authenticated encryption)

### Production Logging

- [ ] No sensitive data in logs (tokens, passwords, crypto addresses)
- [ ] Log level set appropriately (`info` for production)
- [ ] WebApp console.* calls wrapped in DEV check (no console output in production)

---

## Smoke Tests

After deployment, verify core functionality:

### Bot Smoke Test

```
1. Send /start to bot
2. Create a new shop (if new user)
3. Add a product
4. Verify product appears in shop
```

### Backend Health Check

```bash
curl https://your-backend.com/health
# Expected: {"status":"ok","timestamp":"..."}
```

### WebApp Smoke Test

```
1. Open Mini App from Telegram
2. Browse catalog
3. Add item to cart
4. Verify cart updates
```

---

## Deployment Steps

### 1. Database Migrations

```bash
cd backend
npm run migrate
```

### 2. Deploy Backend

```bash
# Your deployment command (PM2, Docker, etc.)
pm2 restart backend
```

### 3. Deploy Bot

```bash
pm2 restart bot
```

### 4. Deploy WebApp

```bash
cd webapp
npm run build
# Deploy dist/ to your hosting
```

---

## Rollback Plan

### If Session Encryption Issues

```bash
# Option 1: Disable encryption (users will re-auth)
unset SESSION_ENCRYPTION_KEY
pm2 restart bot

# Option 2: Restore old key (if backed up)
export SESSION_ENCRYPTION_KEY=<old-key>
pm2 restart bot
```

### If Redis Issues

```bash
# Check Redis connection
redis-cli -h host -p 6379 -a password ping

# Clear all sessions (users will re-auth)
redis-cli -h host -p 6379 -a password FLUSHDB
```

---

## Monitoring

### Key Metrics to Watch

- Bot response time
- Redis memory usage
- Session encryption/decryption errors in logs
- API error rates (4xx, 5xx)

### Log Patterns to Monitor

```bash
# Watch for encryption issues
grep -i "decryption failed" bot/logs/*.log

# Watch for auth issues
grep -i "authentication" bot/logs/*.log
```

---

## Changes in This Release

### Security Improvements

1. **Session Encryption** - JWT tokens and user data encrypted with AES-256-GCM before storing in Redis
2. **Production Logging** - Removed debug console.log calls, wrapped WebApp logs in DEV check
3. **Test Reliability** - Fixed API mocks, added encryption tests

### Files Changed

| File | Change |
|------|--------|
| `bot/src/utils/sessionCrypto.js` | NEW - Encryption utility |
| `bot/src/middleware/redisSession.js` | Added encryption hooks |
| `bot/src/config/index.js` | Added SESSION_ENCRYPTION_KEY |
| `bot/src/utils/shopHealthCheck.js` | Replaced console.* with logger |
| `bot/tests/helpers/api-mocks.js` | Added bot-register mock |
| `bot/tests/unit/sessionCrypto.test.js` | NEW - 19 encryption tests |
| `webapp/src/**/*.js` | Wrapped console.* in DEV check |

### New Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_ENCRYPTION_KEY` | Recommended | AES-256-GCM key for session encryption |

---

## Support

If issues arise during release:

1. Check logs in `backend/logs/` and `bot/logs/`
2. Verify all environment variables are set correctly
3. Test Redis connectivity
4. Review recent commits for breaking changes
