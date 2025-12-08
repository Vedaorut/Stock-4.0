#!/bin/bash
#
# Post-Deploy Verification
# Run after deployment to verify system health
#
# Usage: npm run verify
# Args:  BASE_URL (optional, default: http://localhost:3000)
#

set -e

BASE_URL="${1:-http://localhost:3000}"
TIMEOUT=10

echo "========================================"
echo "  POST-DEPLOY VERIFICATION"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Target: $BASE_URL"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILED=0

# 1. Health Check
echo -e "${YELLOW}[1/4]${NC} Checking /health endpoint..."
HEALTH_RESPONSE=$(curl -s --max-time $TIMEOUT "$BASE_URL/health" 2>/dev/null || echo "FAILED")

if echo "$HEALTH_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Health check passed${NC}"

  # Extract release info if available
  COMMIT=$(echo "$HEALTH_RESPONSE" | grep -o '"commit_sha":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
  BUILD_TIME=$(echo "$HEALTH_RESPONSE" | grep -o '"build_time":"[^"]*"' | cut -d'"' -f4 || echo "N/A")

  if [ "$COMMIT" != "N/A" ]; then
    echo "   Commit: $COMMIT"
    echo "   Build:  $BUILD_TIME"
  fi
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "   Response: ${HEALTH_RESPONSE:0:200}"
  FAILED=1
fi
echo ""

# 2. Feature Flags Status
echo -e "${YELLOW}[2/4]${NC} Checking feature flags..."
FLAGS_RESPONSE=$(curl -s --max-time $TIMEOUT "$BASE_URL/api/internal/status/features" 2>/dev/null || echo "FAILED")

if echo "$FLAGS_RESPONSE" | grep -q '"success":true\|"paymentsEnabled"'; then
  echo -e "${GREEN}✓ Feature flags endpoint accessible${NC}"

  # Parse flags
  PAYMENTS=$(echo "$FLAGS_RESPONSE" | grep -o '"paymentsEnabled":[^,}]*' | cut -d':' -f2)
  SUBS=$(echo "$FLAGS_RESPONSE" | grep -o '"subscriptionsEnabled":[^,}]*' | cut -d':' -f2)

  echo "   Payments: $PAYMENTS"
  echo "   Subscriptions: $SUBS"
else
  echo -e "${YELLOW}! Feature flags endpoint not found (optional)${NC}"
fi
echo ""

# 3. WebSocket Check (если есть ws endpoint)
echo -e "${YELLOW}[3/4]${NC} Checking WebSocket..."
# Simple HTTP upgrade check - не полный WS handshake
WS_URL="${BASE_URL/http/ws}/socket.io/?EIO=4&transport=polling"
WS_RESPONSE=$(curl -s --max-time $TIMEOUT "${BASE_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "FAILED")

if echo "$WS_RESPONSE" | grep -q 'sid\|"0"'; then
  echo -e "${GREEN}✓ WebSocket handshake OK${NC}"
else
  echo -e "${YELLOW}! WebSocket check inconclusive${NC}"
  echo "   (May need browser test)"
fi
echo ""

# 4. Database connectivity (через health)
echo -e "${YELLOW}[4/4]${NC} Checking database..."
if echo "$HEALTH_RESPONSE" | grep -q '"database":"Connected"'; then
  echo -e "${GREEN}✓ Database connected${NC}"
else
  echo -e "${RED}✗ Database not connected${NC}"
  FAILED=1
fi
echo ""

# Worker check (if worker process exists in pm2)
echo "Additional checks:"
if command -v pm2 &> /dev/null; then
  echo "  PM2 processes:"
  pm2 list 2>/dev/null | grep -E "(backend|bot|worker)" || echo "  (no processes found)"
fi
echo ""

# Summary
echo "========================================"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}  POST-DEPLOY: VERIFICATION PASSED ✓${NC}"
  echo "========================================"
  echo ""
  echo "Release marker: RELEASE $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown') verified"
  exit 0
else
  echo -e "${RED}  POST-DEPLOY: VERIFICATION FAILED ✗${NC}"
  echo "========================================"
  echo ""
  echo "Consider rollback: npm run rollback"
  exit 1
fi
