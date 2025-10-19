---
name: fix-all
description: Debug and fix ALL components (backend, bot, webapp) automatically until everything works
---

Use the **debug-master** agent to fix ALL parts of the project automatically:

1. Check and fix **Backend** (port 3000)
2. Check and fix **Bot** (Telegram connection)
3. Check and fix **WebApp** (port 5173)

The agent should:
- Start each component in background
- Check logs for errors
- Fix issues automatically
- Test after each fix
- Keep iterating until ALL components work

**Goal:** Everything should run successfully:
- ✅ Backend on http://localhost:3000
- ✅ Bot connected to Telegram
- ✅ WebApp dev server on http://localhost:5173

The agent works AUTOMATICALLY and reports when everything is fixed.

**Example invocation:**
```
Use debug-master to check and fix all components of the project.
Start with backend, then bot, then webapp.
Fix all errors automatically until everything works.
```
