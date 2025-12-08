#!/bin/bash
#
# Pre-Deploy Checklist
# Run before every deployment to ensure code quality
#
# Usage: npm run predeploy
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "  PRE-DEPLOY CHECKLIST"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

cd "$BACKEND_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# 1. Lint Check
echo -e "${YELLOW}[1/5]${NC} Running ESLint..."
if npm run lint:check 2>/dev/null; then
  echo -e "${GREEN}✓ Lint passed${NC}"
else
  echo -e "${RED}✗ Lint failed${NC}"
  FAILED=1
fi
echo ""

# 2. Smoke Tests
echo -e "${YELLOW}[2/5]${NC} Running smoke tests..."
if npm run smoke:ci 2>/dev/null; then
  echo -e "${GREEN}✓ Smoke tests passed${NC}"
else
  echo -e "${RED}✗ Smoke tests failed${NC}"
  FAILED=1
fi
echo ""

# 3. Check for uncommitted changes
echo -e "${YELLOW}[3/5]${NC} Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
  echo -e "${GREEN}✓ Working directory clean${NC}"
else
  echo -e "${YELLOW}! Uncommitted changes detected:${NC}"
  git status --short
fi
echo ""

# 4. Check migrations
echo -e "${YELLOW}[4/5]${NC} Checking pending migrations..."
MIGRATIONS_DIR="$BACKEND_DIR/database/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  PENDING=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')
  echo "   Found $PENDING migration files"

  # Check if migrations have been applied (by checking for marker table)
  if command -v psql &> /dev/null; then
    echo "   Tip: Review migrations before deploy"
    ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | tail -5
  fi
  echo -e "${GREEN}✓ Migration check complete${NC}"
else
  echo -e "${YELLOW}! No migrations directory found${NC}"
fi
echo ""

# 5. Environment check
echo -e "${YELLOW}[5/5]${NC} Checking environment..."
REQUIRED_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "TELEGRAM_BOT_TOKEN"
)
MISSING_VARS=()

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    MISSING_VARS+=("$VAR")
  fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ Required environment variables set${NC}"
else
  echo -e "${YELLOW}! Missing environment variables: ${MISSING_VARS[*]}${NC}"
  echo "   (OK if using .env file)"
fi
echo ""

# Summary
echo "========================================"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}  PRE-DEPLOY: ALL CHECKS PASSED ✓${NC}"
  echo "========================================"
  echo ""
  echo "Ready to deploy. Run:"
  echo "  npm run deploy"
  exit 0
else
  echo -e "${RED}  PRE-DEPLOY: CHECKS FAILED ✗${NC}"
  echo "========================================"
  echo ""
  echo "Fix issues before deploying!"
  exit 1
fi
