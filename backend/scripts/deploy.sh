#!/bin/bash
#
# Deploy Script for PM2
# Full deployment with pre-checks and verification
#
# Usage: npm run deploy
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "  DEPLOYMENT"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$BACKEND_DIR"

# Get commit info
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

echo -e "${BLUE}Commit: $COMMIT_SHA${NC}"
echo -e "${BLUE}Build:  $BUILD_TIME${NC}"
echo ""

# Step 1: Pre-deploy checks
echo -e "${YELLOW}Step 1: Pre-deploy checks${NC}"
if ! bash "$SCRIPT_DIR/predeploy.sh"; then
  echo -e "${RED}Pre-deploy checks failed. Aborting.${NC}"
  exit 1
fi
echo ""

# Step 2: Write release info
echo -e "${YELLOW}Step 2: Writing release marker${NC}"
cat > "$BACKEND_DIR/src/release.json" << EOF
{
  "commit_sha": "$COMMIT_FULL",
  "commit_short": "$COMMIT_SHA",
  "build_time": "$BUILD_TIME",
  "deployed_by": "$(whoami)",
  "deployed_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
echo -e "${GREEN}✓ Release marker written${NC}"
echo ""

# Step 3: Log release start
echo -e "${YELLOW}Step 3: Starting release${NC}"
echo "[RELEASE] $(date '+%Y-%m-%d %H:%M:%S') - Release $COMMIT_SHA started" | tee -a logs/deploy.log 2>/dev/null || true

# Step 4: PM2 reload
echo -e "${YELLOW}Step 4: Reloading PM2 services${NC}"
if command -v pm2 &> /dev/null; then
  # Reload with 0-downtime if possible
  pm2 reload all --update-env 2>/dev/null || pm2 restart all 2>/dev/null || {
    echo -e "${YELLOW}PM2 not running. Starting services...${NC}"
    pm2 start ecosystem.config.cjs 2>/dev/null || pm2 start src/server.js --name backend 2>/dev/null || true
  }
  echo -e "${GREEN}✓ PM2 services updated${NC}"
else
  echo -e "${YELLOW}PM2 not found. Manual restart required.${NC}"
fi
echo ""

# Step 5: Wait for services
echo -e "${YELLOW}Step 5: Waiting for services (10s)${NC}"
sleep 10
echo ""

# Step 6: Post-deploy verification
echo -e "${YELLOW}Step 6: Post-deploy verification${NC}"
if bash "$SCRIPT_DIR/postdeploy-verify.sh" "$BASE_URL"; then
  echo ""
  echo "[RELEASE] $(date '+%Y-%m-%d %H:%M:%S') - Release $COMMIT_SHA verified" | tee -a logs/deploy.log 2>/dev/null || true
else
  echo ""
  echo -e "${RED}Verification failed!${NC}"
  echo "[RELEASE] $(date '+%Y-%m-%d %H:%M:%S') - Release $COMMIT_SHA FAILED verification" | tee -a logs/deploy.log 2>/dev/null || true
  echo ""
  read -p "Rollback? [Y/n] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    bash "$SCRIPT_DIR/rollback.sh"
  fi
  exit 1
fi

echo ""
echo "========================================"
echo -e "${GREEN}  DEPLOYMENT COMPLETE ✓${NC}"
echo "========================================"
echo ""
echo "Release: $COMMIT_SHA"
echo "Time:    $BUILD_TIME"
echo ""
