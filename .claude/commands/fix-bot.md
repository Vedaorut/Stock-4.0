---
name: fix-bot
description: Debug and fix only the telegram bot automatically
---

Use **debug-master** to fix Telegram bot errors automatically.

The agent will:
1. Start the bot
2. Check logs for errors
3. Fix any issues found
4. Test the fixes
5. Keep iterating until bot connects to Telegram successfully

**Success criteria:**
- ✅ Bot started successfully
- ✅ Connected to Telegram API
- ✅ Listening for updates
- ✅ Backend API connection working

**Example invocation:**
```
Use debug-master to fix the bot. Keep iterating until it connects successfully.
```
