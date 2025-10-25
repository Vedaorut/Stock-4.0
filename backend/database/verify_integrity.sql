-- ============================================
-- Database Integrity Verification Queries
-- ============================================
-- Run after applying migrations to verify data integrity
-- Usage: psql $DATABASE_URL -f verify_integrity.sql
-- ============================================

\echo '========================================='
\echo '  Database Integrity Checks'
\echo '========================================='
\echo ''

-- 1. Orphaned Products
\echo '1. Checking for orphaned products (without shop):'
SELECT COUNT(*) as orphaned_products
FROM products p
LEFT JOIN shops s ON p.shop_id = s.id
WHERE s.id IS NULL;

-- 2. Orphaned Orders
\echo ''
\echo '2. Checking for orders without buyer (acceptable if user deleted):'
SELECT COUNT(*) as orders_no_buyer
FROM orders o
WHERE o.buyer_id IS NULL;

-- 3. Orphaned Payments
\echo ''
\echo '3. Checking for orphaned payments (CRITICAL if > 0):'
SELECT COUNT(*) as orphaned_payments
FROM payments p
LEFT JOIN orders o ON p.order_id = o.id
WHERE o.id IS NULL;

-- 4. Orphaned Shop Subscriptions
\echo ''
\echo '4. Checking for orphaned shop_subscriptions (CRITICAL if > 0):'
SELECT COUNT(*) as orphaned_shop_subs
FROM shop_subscriptions ss
LEFT JOIN shops s ON ss.shop_id = s.id
WHERE s.id IS NULL;

-- 5. Broken Synced Products
\echo ''
\echo '5. Checking for synced products referencing deleted products:'
SELECT COUNT(*) as broken_synced_products
FROM synced_products sp
LEFT JOIN products p1 ON sp.synced_product_id = p1.id
LEFT JOIN products p2 ON sp.source_product_id = p2.id
WHERE p1.id IS NULL OR p2.id IS NULL;

-- 6. Broken Shop Follows
\echo ''
\echo '6. Checking for shop_follows with deleted shops:'
SELECT COUNT(*) as broken_follows
FROM shop_follows sf
LEFT JOIN shops s1 ON sf.follower_shop_id = s1.id
LEFT JOIN shops s2 ON sf.source_shop_id = s2.id
WHERE s1.id IS NULL OR s2.id IS NULL;

-- 7. Orphaned Shop Workers
\echo ''
\echo '7. Checking for orphaned shop_workers:'
SELECT COUNT(*) as orphaned_workers
FROM shop_workers sw
LEFT JOIN shops s ON sw.shop_id = s.id
LEFT JOIN users u ON sw.worker_user_id = u.id
WHERE s.id IS NULL OR u.id IS NULL;

-- 8. Orphaned Invoices
\echo ''
\echo '8. Checking for orphaned invoices:'
SELECT COUNT(*) as orphaned_invoices
FROM invoices i
LEFT JOIN orders o ON i.order_id = o.id
WHERE o.id IS NULL;

-- 9. Subscriptions to Inactive Shops
\echo ''
\echo '9. Subscriptions to inactive shops (acceptable but should be monitored):'
SELECT COUNT(*) as subs_to_inactive
FROM subscriptions s
JOIN shops sh ON s.shop_id = sh.id
WHERE sh.is_active = false;

-- 10. Circular Shop Follows
\echo ''
\echo '10. Checking for circular shop follows (A→B, B→A):'
SELECT COUNT(*) as circular_follows
FROM shop_follows sf1
JOIN shop_follows sf2
  ON sf1.follower_shop_id = sf2.source_shop_id
  AND sf1.source_shop_id = sf2.follower_shop_id
WHERE sf1.status != 'cancelled' AND sf2.status != 'cancelled';

\echo ''
\echo '========================================='
\echo '  Index Verification'
\echo '========================================='
\echo ''

-- List all indexes
\echo 'All indexes on critical tables:'
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'shop_workers', 'invoices', 'payments')
ORDER BY tablename, indexname;

\echo ''
\echo '========================================='
\echo '  Foreign Key Verification'
\echo '========================================='
\echo ''

-- List all foreign keys
\echo 'All foreign key constraints:'
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

\echo ''
\echo '========================================='
\echo '  Trigger Verification'
\echo '========================================='
\echo ''

-- List all triggers
\echo 'All triggers:'
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo ''
\echo '========================================='
\echo '  Summary'
\echo '========================================='
\echo ''
\echo 'Expected Results:'
\echo '  - orphaned_payments: 0 (CRITICAL)'
\echo '  - orphaned_shop_subs: 0 (CRITICAL)'
\echo '  - orphaned_workers: 0 (CRITICAL)'
\echo '  - orphaned_invoices: 0 (CRITICAL)'
\echo '  - broken_synced_products: 0 (CRITICAL)'
\echo '  - broken_follows: 0 (CRITICAL)'
\echo '  - circular_follows: 0 (WARNING if > 0)'
\echo '  - orders_no_buyer: acceptable (ON DELETE SET NULL)'
\echo '  - subs_to_inactive: acceptable (shops can be inactive)'
\echo ''
\echo 'If any CRITICAL checks fail, run cleanup queries!'
\echo ''
