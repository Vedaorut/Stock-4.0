# Smoke Tests

## Overview
Smoke tests verify critical functionality before deployment.
Fast tests (< 30 seconds total) that catch breaking changes in:

### Payment Flow (`paymentFlow.smoke.test.js`)
- Late payment detection (needs_review status)
- Race condition prevention (ON CONFLICT)
- Invoice expiry validation
- Payment status transitions

### Backend Infrastructure (`backend.smoke.test.js`)
- Health endpoint
- Database connection
- Auth middleware
- Critical API routes

### Seller Flow (`sellerFlow.smoke.test.js`)
- Create shop
- Add product
- View products
- View orders
- Update product

### Buyer Flow (`buyerFlow.smoke.test.js`)
- View catalog
- View product details
- Create order
- View order status
- Order history

## Running Locally

```bash
# Run all smoke tests
npm run smoke

# Run with verbose output
npm run smoke -- --verbose

# Run specific test file
npm run smoke -- paymentFlow.smoke.test.js
```

## Running in CI

```bash
npm run smoke:ci
```

The `:ci` variant includes:
- `--forceExit` to ensure process exits
- `--detectOpenHandles` to find unclosed resources
- 30 second timeout per test

## Prerequisites

1. Database must be running with test schema
2. Apply migrations: `npm run test:ci` (applies migrations first)
3. Set required env vars (or use .env.test)

## Test Coverage

| Test Suite | Tests | Coverage |
|------------|-------|----------|
| Backend Infrastructure | 7 | Health, DB, Auth, Routes, Errors |
| Payment Flow | 5 | Late payment, Race conditions, Expiry |
| Seller Flow | 7 | Shop CRUD, Products, Orders |
| Buyer Flow | 8 | Catalog, Order lifecycle |

## Mocking

Tests mock external services:
- `blockchainVerificationService` - No real blockchain API calls
- Real database with test data (telegram_id >= 9000000000)

## Adding New Smoke Tests

1. Create file: `__tests__/smoke/yourFeature.smoke.test.js`
2. Use test helpers from `../helpers/testDb.js`
3. Mark test users with `telegram_id >= 9000000000`
4. Clean up test data in `beforeEach`

## CI Guard

To block deployment on smoke test failure, add to your CI pipeline:

```yaml
- name: Run smoke tests
  run: npm run smoke:ci
  # Pipeline fails if exit code != 0
```
