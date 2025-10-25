# Database Migrations

This directory contains database migration scripts for the Status Stock platform.

## Migration History

| # | File | Description | Date | Status |
|---|------|-------------|------|--------|
| 001 | (schema.sql) | Initial schema | 2025-01-01 | Applied |
| 002 | 002_add_shop_workers.sql | Add shop_workers table for workspace | 2025-10-25 | Pending |
| 003 | 003_add_invoices.sql | Add invoices table for Tatum payments | 2025-10-25 | Pending |
| 004 | 004_add_missing_indexes.sql | Performance indexes | 2025-10-25 | Pending |
| 005 | 005_prevent_circular_follows.sql | Circular follow prevention trigger | 2025-10-25 | Pending |

## How to Apply Migrations

### Development Environment

```bash
# Apply all pending migrations
cd backend
psql $DATABASE_URL -f database/migrations/002_add_shop_workers.sql
psql $DATABASE_URL -f database/migrations/003_add_invoices.sql
psql $DATABASE_URL -f database/migrations/004_add_missing_indexes.sql
psql $DATABASE_URL -f database/migrations/005_prevent_circular_follows.sql
```

### Production Environment

**IMPORTANT:** Always backup database before migrations!

```bash
# 1. Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Test migration on staging
psql $STAGING_DATABASE_URL -f database/migrations/002_add_shop_workers.sql

# 3. Verify schema
psql $STAGING_DATABASE_URL -c "\d shop_workers"

# 4. If successful, apply to production
psql $DATABASE_URL -f database/migrations/002_add_shop_workers.sql

# 5. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM shop_workers"
```

## Rollback

Each migration has a DOWN section for rollback:

```bash
# Extract and run DOWN section
psql $DATABASE_URL <<EOF
BEGIN;
DROP TABLE IF EXISTS shop_workers CASCADE;
COMMIT;
EOF
```

## Migration Best Practices

1. **Always backup** before running migrations on production
2. **Test on staging** environment first
3. **Use transactions** (BEGIN/COMMIT) for atomic changes
4. **Add comments** to document purpose and dependencies
5. **Keep migrations small** - one logical change per file
6. **Never modify** existing migration files - create new ones
7. **Version control** all migration files in git

## Critical Migrations (Must Apply)

These migrations fix critical bugs and must be applied before production:

- **002_add_shop_workers.sql** - Fixes workspace functionality (currently broken)
- **003_add_invoices.sql** - Fixes payment system (currently broken)
- **004_add_missing_indexes.sql** - Fixes performance issues (10x speedup)

## Migration Status Tracking

To track which migrations are applied, create a migrations table:

```sql
CREATE TABLE schema_migrations (
  version INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- Record applied migrations
INSERT INTO schema_migrations (version, name) VALUES
(1, 'initial_schema'),
(2, 'add_shop_workers'),
(3, 'add_invoices'),
(4, 'add_missing_indexes'),
(5, 'prevent_circular_follows');
```

## Verification Queries

After applying migrations, run these to verify:

```sql
-- Check all tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check all indexes exist
SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

-- Verify foreign key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Verify triggers
SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';
```

## Troubleshooting

### "relation already exists"

If migration fails because table already exists:

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'shop_workers'
);

-- If true, skip migration or drop and recreate
DROP TABLE shop_workers CASCADE;
```

### "constraint already exists"

```sql
-- Check existing constraints
SELECT conname FROM pg_constraint WHERE conname = 'idx_orders_status';

-- Drop if needed
DROP INDEX IF EXISTS idx_orders_status;
```

### Migration hangs

Likely due to table locks. Check active queries:

```sql
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%';

-- Kill blocking query if needed
SELECT pg_terminate_backend(pid);
```

## Contact

For migration issues, contact:
- Backend Team Lead
- Database Administrator
- DevOps Team

## References

- Database Audit Report: `backend/DATABASE_AUDIT.md`
- Schema Documentation: `backend/database/schema.sql`
- PostgreSQL Docs: https://www.postgresql.org/docs/
