#!/bin/bash
#
# Rollback Script for PM2 Deployments
# Reverts to previous release or disables features
#
# Usage:
#   npm run rollback           # Full rollback via git
#   npm run rollback:flags     # Disable features only (fast)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "  ROLLBACK"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$BACKEND_DIR"

# Check rollback mode
MODE="${1:-full}"

if [ "$MODE" = "flags" ] || [ "$MODE" = "emergency" ]; then
  echo -e "${YELLOW}EMERGENCY MODE: Disabling feature flags${NC}"
  echo ""

  # Create/update .env with disabled features
  echo "Setting PAYMENTS_ENABLED=false"
  echo "Setting SUBSCRIPTIONS_ENABLED=false"

  # If .env exists, update it; otherwise create
  if [ -f ".env" ]; then
    # Update or add flags
    if grep -q "PAYMENTS_ENABLED" .env; then
      sed -i.bak 's/PAYMENTS_ENABLED=.*/PAYMENTS_ENABLED=false/' .env
    else
      echo "PAYMENTS_ENABLED=false" >> .env
    fi

    if grep -q "SUBSCRIPTIONS_ENABLED" .env; then
      sed -i.bak 's/SUBSCRIPTIONS_ENABLED=.*/SUBSCRIPTIONS_ENABLED=false/' .env
    else
      echo "SUBSCRIPTIONS_ENABLED=false" >> .env
    fi

    rm -f .env.bak
  else
    echo "PAYMENTS_ENABLED=false" >> .env
    echo "SUBSCRIPTIONS_ENABLED=false" >> .env
  fi

  echo ""
  echo "Restarting services..."

  if command -v pm2 &> /dev/null; then
    pm2 reload all 2>/dev/null || pm2 restart all 2>/dev/null || true
    echo -e "${GREEN}✓ PM2 services reloaded${NC}"
  fi

  echo ""
  echo -e "${GREEN}Emergency rollback complete${NC}"
  echo "Features disabled. Investigate and fix, then re-enable."
  exit 0
fi

# Full rollback via git
echo -e "${YELLOW}FULL ROLLBACK: Reverting to previous commit${NC}"
echo ""

# Get current and previous commit
CURRENT=$(git rev-parse --short HEAD)
PREVIOUS=$(git rev-parse --short HEAD~1 2>/dev/null || echo "")

if [ -z "$PREVIOUS" ]; then
  echo -e "${RED}Cannot find previous commit${NC}"
  exit 1
fi

echo "Current:  $CURRENT"
echo "Rolling back to: $PREVIOUS"
echo ""

read -p "Proceed with rollback? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Rollback cancelled"
  exit 0
fi

# Git reset
echo "Resetting to previous commit..."
git checkout HEAD~1

# Reinstall dependencies if needed
if git diff --name-only HEAD~1 HEAD | grep -q "package-lock.json"; then
  echo "Package changes detected, running npm install..."
  npm install
fi

# Restart PM2
if command -v pm2 &> /dev/null; then
  echo "Restarting PM2 services..."
  pm2 reload all 2>/dev/null || pm2 restart all 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}✓ Rollback complete${NC}"
echo ""
echo "Rolled back to: $PREVIOUS"
echo ""
echo "Next steps:"
echo "  1. Verify: npm run verify"
echo "  2. Investigate the issue"
echo "  3. Fix and redeploy"

# Log rollback event
echo "[ROLLBACK] $(date '+%Y-%m-%d %H:%M:%S') - Rolled back from $CURRENT to $PREVIOUS" >> "$BACKEND_DIR/logs/rollback.log" 2>/dev/null || true
