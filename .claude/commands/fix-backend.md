---
name: fix-backend
description: Debug and fix only the backend automatically
---

Use **debug-master** to fix backend errors automatically.

The agent will:
1. Start the backend server
2. Check logs for errors
3. Fix any issues found
4. Test the fixes
5. Keep iterating until backend runs successfully on port 3000

**Success criteria:**
- ✅ Server started successfully
- ✅ Database connected
- ✅ Port 3000 listening
- ✅ Health endpoint responds

**Example invocation:**
```
Use debug-master to fix the backend. Keep iterating until it runs successfully.
```
