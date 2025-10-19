---
name: fix-webapp
description: Debug and fix only the webapp automatically
---

Use **debug-master** to fix webapp errors automatically.

The agent will:
1. Start the Vite dev server
2. Check logs for errors
3. Fix any issues found
4. Test the fixes
5. Keep iterating until webapp runs on localhost:5173 successfully

**Success criteria:**
- ✅ Vite dev server started
- ✅ Running on http://localhost:5173
- ✅ No build errors
- ✅ No console errors
- ✅ Page loads successfully

**Example invocation:**
```
Use debug-master to fix the webapp. Keep iterating until dev server runs successfully.
```
