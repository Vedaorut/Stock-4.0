# Status Stock - CLAUDE.md

## Project Overview

**Status Stock** — Telegram E-Commerce platform for digital shops with crypto payments.

```
backend/   Express + PostgreSQL + WebSocket + Redis (Bull queues)
bot/       Telegraf.js Telegram Bot with scenes
webapp/    React + Vite + TailwindCSS + Zustand (Mini App)
```

---

## Subagent Delegation Matrix

**ALWAYS delegate code work to specialized agents:**

| Task | Delegate To | Proactive |
|------|-------------|-----------|
| API endpoints, Express routes | `backend-architect` | Yes |
| React components, TailwindCSS | `frontend-developer` | Yes |
| PostgreSQL, migrations, SQL | `database-designer` | Yes |
| Telegraf handlers, scenes, keyboards | `telegram-bot-expert` | Yes |
| Bugs, test failures, errors | `debug-master` | Yes |
| Crypto payments, blockchain | `crypto-integration-specialist` | Yes |
| UI/UX research, design patterns | `design-researcher` | Yes |
| Documentation, tutorials | `internel` | No |
| Codebase exploration | `Explore` | Always |

### Delegation Examples

**Feature implementation (parallel):**
```
Task 1 → frontend-developer: "Build PaymentModal component with crypto selection"
Task 2 → backend-architect: "Create POST /api/payments/initiate endpoint"
Task 3 → database-designer: "Add payments table with status enum"
```

**Bug fixing:**
```
Task → debug-master: "Backend crashes on startup with error: X. Find root cause and fix."
```

**Complex exploration:**
```
Task → Explore: "How does payment verification flow work? Trace from order creation to confirmation."
```

---

## Commands

```bash
# Full stack
./start.sh              # Cloudflare + backend + bot
./stop.sh               # Stop all

# Development
cd backend && npm run dev        # Backend :3000
cd bot && npm run dev            # Telegram bot
cd webapp && npm run dev         # React :5173

# Testing
cd backend && npm test           # Jest
cd backend && npm run lint       # ESLint
cd bot && npm test               # Bot tests

# Database
psql telegram_shop               # Connect
```

---

## Architecture Quick Reference

### Backend Request Flow
```
routes/ → controllers/ → services/ → database/queries/
```

**Key Services:**
- `blockchainVerificationService.js` — Crypto payment verification
- `subscriptionService.js` — Shop subscription management
- `paymentVerificationWorker.js` — Background payment polling

### Bot Structure
```
handlers/ → command/callback handlers
scenes/   → WizardScenes for multi-step flows
keyboards/ → Inline keyboard builders
```

### WebApp State
```
store/useStore.js → Zustand (products, cart, orders, user)
hooks/useApi.js   → Axios with token refresh
hooks/useWebSocket.js → Real-time updates
```

### Database Schema
```
users → shops → products → orders → order_items
              ↘ shop_workers (PRO tier)
              ↘ shop_follows → synced_products
              ↘ subscriptions
```

---

## Business Rules

- **Follows:** BASIC = 2, PRO = unlimited
- **Workers:** PRO tier only
- **Subscription grace:** 2 days
- **Cloudflare tunnel required** for Mini App

---

## Code Style

- ES modules (`import/export`)
- Arrow functions, `async/await`
- camelCase (vars), PascalCase (components)

---

## Anti-Patterns

**NEVER:**
- Edit `.env` files
- Create REPORT.md / SUMMARY.md files
- Write code directly (delegate to agents)
- Use Bash for file operations

**ALWAYS:**
- Delegate to specialized agents
- Use MCP tools for file ops
- Run tests after changes
- Keep changes minimal and focused
