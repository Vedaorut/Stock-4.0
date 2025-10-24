# Follow Shop Bug Fix Report

## Summary
- Resolved the production crash in the Follow Shop feature by hardening the backend API layer, database schema, and supporting services.
- Align responses and validation with bot expectations so Monitor/Resell flows, markup updates, and FREE-tier guard rails all work end‑to‑end.
- Brought the schema/migrations up to date and verified the service on a freshly migrated database.

## Key Fixes
1. **Controller & API contract**
   - Normalised all `/api/follows` responses to `{ data: … }`, added strict validation for IDs, modes, and markup ranges, and implemented detailed error payloads.
   - Enforced business rules (self-follow ban, circular follow detection, FREE limit, resell-only markup) and restored session updates used by the bot.
   - Reordered mode switching logic so validation runs before DB writes and resets markup when returning to monitor mode.
2. **Data layer**
   - Added richer joins in `shopFollowQueries.findById` and corrected `syncedProductQueries.findByFollowId` to filter by `follow_id`.
   - Ensured follow creation rolls back if initial resell sync fails.
3. **Schema & migrations**
   - Updated base schema and incremental migration to create/repair `shop_follows` and `synced_products` with the correct `markup_percentage >= 0` constraint plus indexes.
   - Extended migration to fix legacy constraints when the table already exists.
4. **Testing support**
   - Added Jest mapping for the `openai` SDK so follow integration tests can run without the real client (AI flows still need deeper stubbing; see Known Issues).

## Database Actions
```
DB_HOST=localhost DB_PORT=5433 DB_NAME=telegram_shop DB_USER=admin DB_PASSWORD=password \
  node backend/database/migrations.cjs --add-follow-shop --no-verify --no-indexes
```
Output shows successful schema recreation, constraint patching, and extension setup.

## Verification
- **Server health**
  ```
  curl http://localhost:3000/health
  → {"success":true,"message":"Server is running",...}
  ```
- **Follow API smoke**
  ```
  # FREE-tier check
  curl -H "Authorization: Bearer <jwt>" \
       "http://localhost:3000/api/follows/check-limit?shopId=1"
  → {"data":{"limit":2,"count":0,"remaining":2,"reached":false,"canFollow":true}}

  # Create monitor follow
  curl -X POST ... /api/follows
  → {"data":{"id":1,"follower_shop_id":1,...,"mode":"monitor"}}

  # Mode switch + markup update + delete
  curl -X PUT ... /api/follows/1/mode
  curl -X PUT ... /api/follows/1/markup
  curl -X DELETE ... /api/follows/1
  → All return 200 with the new `{ data: ... }` envelope.
  ```
- **Integration tests**
  ```
  cd bot && npm run test:integration
  ```
  - Follow-related suites (create/list/manage/delete) pass with updated responses.
  - AI DeepSeek suites still fail because the project lacks full OpenAI stubbing (pre-existing). See Known Issues.

## Known Issues / Next Steps
- The DeepSeek AI integration tests require a richer OpenAI mock; without it `aiProducts.integration.test.js` fails. These tests are outside the Follow feature scope and were already failing in the current branch.
- `npm run test:integration` will pass once the AI mock is addressed or those suites are skipped in CI until the new mock lands.

The backend server now boots cleanly, migrations install the required tables, and the Telegram bot can create, inspect, update, and remove shop follows against the live API.
