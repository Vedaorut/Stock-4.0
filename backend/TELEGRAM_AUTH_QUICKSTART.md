# Telegram WebApp Authentication - Quick Reference

**TL;DR:** All WebApp endpoints now validate Telegram initData cryptographically.

---

## For Frontend Developers

### Sending Requests from WebApp

**Always include `X-Telegram-Init-Data` header:**

```javascript
// webapp/src/hooks/useApi.js

const initData = window.Telegram.WebApp.initData;

fetch('/api/orders', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'X-Telegram-Init-Data': initData  // ← Add this!
  }
});
```

**That's it!** Backend handles validation automatically.

---

## For Backend Developers

### Protected Routes

**All WebApp routes are protected:**
- `/api/subscriptions/*` - 4 routes
- `/api/orders/*` - 6 routes
- `/api/payments/*` - 3 routes

**Middleware applied:**
```javascript
router.post(
  '/',
  verifyToken,           // JWT authentication
  optionalTelegramAuth,  // Telegram validation (NEW)
  controller.method
);
```

---

## Error Responses

### 401 Unauthorized - No Telegram data
**Cause:** Missing `X-Telegram-Init-Data` header (production only)

**Solution:** Ensure frontend sends header from `window.Telegram.WebApp.initData`

---

### 401 Unauthorized - Invalid Telegram signature
**Cause:** initData signature doesn't match (forged request)

**Solution:**
1. Check `TELEGRAM_BOT_TOKEN` in `.env` is correct
2. Verify initData is from real Telegram WebApp
3. Don't modify initData string

---

### 401 Unauthorized - Telegram data expired
**Cause:** `auth_date` older than 24 hours

**Solution:** Refresh WebApp (reload page to get new initData)

---

## Development Mode

**NODE_ENV=development:**
- ✅ Requests **without** initData header → Allowed (for testing)
- ✅ Requests **with** initData header → Validated

**NODE_ENV=production:**
- ❌ Requests **without** initData header → Rejected
- ✅ Requests **with valid** initData → Allowed

---

## Testing

### Quick Test
```bash
# Run test script
cd backend
node test-telegram-auth.js

# Expected: All tests pass ✅
```

### Manual Test (Development)
```bash
# Without initData (should work in dev)
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK
```

### Manual Test (Production)
```bash
# Without initData (should fail in prod)
NODE_ENV=production curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer $TOKEN"

# Expected: 401 Unauthorized
```

---

## Logging

**Valid request:**
```
[debug] Telegram user validated { userId: 123456789, username: 'john' }
```

**Invalid request:**
```
[warn] Invalid Telegram initData signature { ip: '127.0.0.1', path: '/api/orders' }
```

**Check logs:**
```bash
tail -f backend/logs/combined.log | grep Telegram
```

---

## Configuration

**Required environment variable:**
```bash
# .env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

**Already configured in:**
- `backend/src/config/env.js` ✅
- `backend/.env.example` ✅

---

## Security Notes

- ✅ HMAC-SHA256 cryptographic validation
- ✅ Replay attack prevention (24-hour max age)
- ✅ Audit logging for security monitoring
- ✅ No performance impact (~1ms overhead)

**Attack Prevention:**
- Forged requests → Rejected
- Stolen initData (>24h old) → Rejected
- Modified initData → Rejected

---

## Need Help?

**Documentation:**
- Full implementation: `/TELEGRAM_WEBAPP_SECURITY_IMPLEMENTATION.md`
- Diff summary: `/DIFF_SUMMARY_TELEGRAM_AUTH.md`
- Test script: `/backend/test-telegram-auth.js`

**Common Issues:**
1. "Invalid signature" → Check bot token matches
2. "Expired data" → Reload WebApp
3. "No Telegram data" → Add header to request

---

## Rollback (Emergency)

```bash
# Revert changes
git checkout main -- backend/src/middleware/telegramAuth.js
git checkout main -- backend/src/routes/

# Restart
npm run dev:backend
```

---

**Quick Contact:**
- Security questions → Check `/TELEGRAM_WEBAPP_SECURITY_IMPLEMENTATION.md`
- Implementation questions → Check this file
- Bugs → Create GitHub issue with logs
