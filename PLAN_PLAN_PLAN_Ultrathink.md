# Status Stock 4.0 — Master Audit (Staff Engineer Cut)

## 1) Executive Summary
- P1 payments/i18n: PaymentHashModal had hardcoded EN strings (overlay, errors, label) → fixed with i18n keys + tests.
- P1 UX/tier: Workspace MAX gate mislabeled as PRO in locales → fixed.
- P1 analytics: Multi-item orders counted only by first product; revenue/top-products skewed (orders.product_id only) → pending fix.
- P1 data access: Orders lose shop context when product deleted; seller/worker access & bulk status updates 404 → pending fix.
- P1 payments/time: invoices.expires_at & subscription/refresh timestamps stored without TZ; payment window may drift in non-UTC DB → needs decision/migration.

## 2) Canonical Issue List
| ID | Sev | Area | Symptom | Repro | Root cause | Proof | Fix plan | Status | Sources |
|----|-----|------|---------|-------|------------|-------|----------|--------|---------|
| P1-001 | P1 | webapp | Payment hash overlay, retry button, label shown только EN; no translations | WebApp checkout → I Paid → hash modal | Hardcoded strings in PaymentHashModal | webapp/src/components/Payment/PaymentHashModal.jsx (loading overlay text, error title, label, retry) | Add i18n keys, use t() hooks, extend locale tests | FIXED ✅ | Ch.3.4 (WebApp Buyer), Ч.11-5/6 |
| P1-002 | P1 | webapp | Workspace gate says “PRO” instead of MAX; wrong upgrade hint | Settings → Workspace when tier < MAX | Locale strings proOnly/proOnlyDesc set to PRO | webapp/src/i18n/locales/en.json#L371+, ru.json#L371+ | Update text to MAX; ensure MAX phrasing | FIXED ✅ | Ch.4.4 P1 (WorkspaceModal) |
| P1-003 | P1 | backend | Analytics/top-products count only first item of multi-item order; revenue missing | Seller analytics in WebApp → totals lower than actual | getOrderAnalytics joins orders→products; ignores order_items | backend/src/services/orderService.js:156-198 | Aggregate via order_items with per-item price/quantity; fallback for legacy single-item orders; add test | CONFIRMED (pending fix) | Ч.10-1 |
| P1-004 | P1 | backend | Orders disappear / 404 in bulk status when product deleted; seller/worker lose access/history | Delete product then view orders or bulk update | orderQueries & bulkHandlers INNER JOIN products; orders.product_id nullable | backend/src/database/queries/orderQueries.js:20-176; controllers/order/handlers/bulkHandlers.js:22-41 | Denormalize shop_id/owner_id onto orders or LEFT JOIN with fallback to order_items; adjust access checks; add test | CONFIRMED (pending fix) | Ч.10-2, Ч.11-4 |
| P1-005 | P1 | backend | Payment/refresh/subscription expiry may drift with DB TZ; invoices may accept past window | DB running non-UTC; compare expires_at vs NOW() | TIMESTAMP WITHOUT TZ for invoices.expires_at, refresh_tokens.expires_at, shop_subscriptions.period_* | backend/database/schema.sql lines ~248-277, 459-477 | Migrate to TIMESTAMPTZ + data migration; audit comparisons | NEEDS DECISION | Ч.10-3/4 |

## 3) Risk Clusters
- Payments & Time: P1-005 (TZ), plus payment window uses order.updated_at (needs follow-up).
- Data integrity / analytics: P1-003 (multi-item revenue loss).
- Access/history: P1-004 (deleted products break order visibility).
- i18n/UX: P1-001 (fixed), P1-002 (fixed).

## 4) Fix Roadmap
- Today (P1): ship P1-001, P1-002 (done). Next up: P1-003, P1-004 (backend PR + tests). Decide on P1-005 migration window.
- This week: implement P1-003 (aggregate analytics via order_items) + regression test; implement P1-004 (LEFT join/fallback) + test.
- Next: design TIMESTAMPTZ migration plan for invoices/refresh/subscriptions (P1-005).

## 5) Changelog of Fixes (this session)
- PaymentHashModal i18n: added `payment.verifyingTransaction`, `payment.verifyingDesc`, `payment.txHashLabel`; wired overlay/error/label/retry to t(); test updated. Files: `webapp/src/components/Payment/PaymentHashModal.jsx`, `webapp/src/i18n/locales/en.json`, `webapp/src/i18n/locales/ru.json`, `webapp/src/i18n/__tests__/i18n.keys.test.js`.
- Workspace tier copy: updated `workspace.proOnly` / `proOnlyDesc` to MAX in both locales.
