#!/bin/bash

# ============================================
# Apply Database Migrations Script
# ============================================
# Usage:
#   ./apply-migrations.sh              # Apply all pending migrations
#   ./apply-migrations.sh --rollback   # Rollback last migration
#   ./apply-migrations.sh --verify     # Verify schema only
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load DATABASE_URL from .env
if [ -f ../.env ]; then
  export $(cat ../.env | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
  echo "Set it in backend/.env or export DATABASE_URL=..."
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Status Stock - Database Migrations${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to backup database
backup_db() {
  BACKUP_FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
  mkdir -p backups
  echo -e "${YELLOW}Creating backup: $BACKUP_FILE${NC}"
  pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
  echo -e "${GREEN}✓ Backup created${NC}"
}

# Function to verify schema
verify_schema() {
  echo -e "${BLUE}Verifying schema...${NC}"

  # Check tables
  echo -e "${YELLOW}Checking tables:${NC}"
  TABLES=$(psql "$DATABASE_URL" -tAc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
  echo "$TABLES"

  # Check critical tables
  REQUIRED_TABLES=("users" "shops" "products" "orders" "shop_workers" "invoices" "payments" "subscriptions")
  for table in "${REQUIRED_TABLES[@]}"; do
    if echo "$TABLES" | grep -q "^$table$"; then
      echo -e "${GREEN}✓ $table exists${NC}"
    else
      echo -e "${RED}✗ $table MISSING${NC}"
    fi
  done

  # Check indexes
  echo ""
  echo -e "${YELLOW}Checking critical indexes:${NC}"
  CRITICAL_INDEXES=("idx_orders_status" "idx_orders_buyer_status" "idx_order_items_order_id" "idx_shop_workers_shop" "idx_invoices_order")
  for index in "${CRITICAL_INDEXES[@]}"; do
    if psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = '$index'" | grep -q 1; then
      echo -e "${GREEN}✓ $index exists${NC}"
    else
      echo -e "${RED}✗ $index MISSING${NC}"
    fi
  done

  echo ""
}

# Function to apply migration
apply_migration() {
  MIGRATION_FILE=$1
  echo -e "${BLUE}Applying: $MIGRATION_FILE${NC}"

  if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}ERROR: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
  fi

  # Extract UP section only
  sed -n '/-- UP/,/-- DOWN/p' "$MIGRATION_FILE" | sed '$d' | psql "$DATABASE_URL"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migration applied successfully${NC}"
  else
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
  fi
}

# Function to rollback migration
rollback_migration() {
  MIGRATION_FILE=$1
  echo -e "${YELLOW}Rolling back: $MIGRATION_FILE${NC}"

  if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}ERROR: Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
  fi

  # Extract DOWN section only
  sed -n '/-- DOWN/,/END/p' "$MIGRATION_FILE" | psql "$DATABASE_URL"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Rollback successful${NC}"
  else
    echo -e "${RED}✗ Rollback failed${NC}"
    exit 1
  fi
}

# Parse arguments
case "$1" in
  --verify)
    verify_schema
    exit 0
    ;;
  --rollback)
    echo -e "${YELLOW}WARNING: This will rollback the last migration${NC}"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Cancelled"
      exit 0
    fi

    backup_db

    # Rollback migrations in reverse order
    for migration in 005_prevent_circular_follows.sql 004_add_missing_indexes.sql 003_add_invoices.sql 002_add_shop_workers.sql; do
      if [ -f "migrations/$migration" ]; then
        rollback_migration "migrations/$migration"
        break  # Only rollback last one
      fi
    done

    verify_schema
    exit 0
    ;;
  --help)
    echo "Usage:"
    echo "  ./apply-migrations.sh              Apply all pending migrations"
    echo "  ./apply-migrations.sh --rollback   Rollback last migration"
    echo "  ./apply-migrations.sh --verify     Verify schema only"
    echo "  ./apply-migrations.sh --help       Show this help"
    exit 0
    ;;
esac

# Main migration flow
echo -e "${YELLOW}This will apply migrations 002-005${NC}"
echo -e "${YELLOW}Current database: ${DATABASE_URL%%@*}@***${NC}"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled"
  exit 0
fi

# Create backup
backup_db

echo ""
echo -e "${BLUE}Applying migrations...${NC}"
echo ""

# Apply migrations in order
MIGRATIONS=(
  "migrations/002_add_shop_workers.sql"
  "migrations/003_add_invoices.sql"
  "migrations/004_add_missing_indexes.sql"
  "migrations/005_prevent_circular_follows.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  apply_migration "$migration"
  echo ""
done

# Verify schema
verify_schema

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All migrations applied successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Run integrity checks: psql \$DATABASE_URL -f migrations/verify_integrity.sql"
echo "2. Restart backend: npm run dev"
echo "3. Test endpoints: POST /api/workspace/add-worker"
echo ""
echo -e "${YELLOW}Backup location: backups/${NC}"
