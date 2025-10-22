# DeepSeek Prompt Testing Plan

## Overview

This document outlines the comprehensive testing plan for DeepSeek AI prompts in the Status Stock bot's product management system.

## Testing Objectives

1. **Validate function calling accuracy** - Does AI select correct tools?
2. **Test parameter extraction** - Are arguments parsed correctly from natural language?
3. **Evaluate Russian language understanding** - Quality of RU command interpretation
4. **Measure performance** - Response time, token usage, cost efficiency
5. **Test ambiguity handling** - How AI deals with unclear commands
6. **Validate noise filtering** - Does AI reject non-product commands?

## Test Environment

### Configuration
- **API Endpoint**: https://api.deepseek.com
- **Model**: deepseek-chat
- **API Key**: sk-d7fdc4747b674ef1ad06fe721179b5f6
- **Timeout**: 10 seconds
- **Max Retries**: 3 (with exponential backoff)

### Mock Context
```javascript
{
  shopName: 'Тестовый Магазин',
  products: [
    { id: 1, name: 'iPhone 14', price: 799, stock_quantity: 5 },
    { id: 2, name: 'iPhone 15', price: 999, stock_quantity: 3 },
    { id: 3, name: 'Samsung Galaxy S23', price: 799, stock_quantity: 8 },
    { id: 4, name: 'MacBook Pro M3', price: 1999, stock_quantity: 2 }
  ]
}
```

## Test Categories

### 1. Basic CRUD Operations (5 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "добавь iPhone 15 за 50000₽ количество 10" | `addProduct` | name: "iPhone 15", price: 50000, stock: 10 | RUB currency conversion |
| "добавь AirPods Pro за $249" | `addProduct` | name: "AirPods Pro", price: 249 | USD symbol |
| "удали iPhone" | `searchProduct` | query: "iPhone" | Ambiguous (2 matches) |
| "удали MacBook" | `deleteProduct` | productName: "MacBook" | Unique match |
| "покажи все товары" | `listProducts` | - | No parameters |

**Success Criteria**: ≥80% accuracy

### 2. Bulk Operations (2 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "добавь 3 товара: iPhone 500$, Samsung 400$, Xiaomi 300$" | `addProduct` | First product only | Multi-add not yet supported |
| "удали iPhone и Samsung" | `deleteProduct` | First match | Multi-delete not yet supported |

**Success Criteria**: ≥50% (partial support expected)

**Note**: These tests validate that AI handles first item correctly even when bulk not supported.

### 3. Update Operations (3 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "смени цену iPhone на 45000₽" | `searchProduct` | query: "iPhone" | No updateProduct tool yet |
| "смени название iPhone на iPhone 15 Pro" | `searchProduct` | query: "iPhone" | No updateProduct tool yet |
| "обнови iPhone: цена 48000₽, количество 5" | `searchProduct` | query: "iPhone" | No updateProduct tool yet |

**Success Criteria**: ≥50% (fallback to search expected)

**Note**: These tests will inform Phase 2 implementation of `updateProduct` tool.

### 4. Query Operations (4 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "какие товары есть?" | `listProducts` | - | Natural list query |
| "какая цена у iPhone?" | `searchProduct` | query: "iPhone" | Price query |
| "сколько осталось MacBook?" | `searchProduct` | query: "MacBook" | Stock query |
| "есть ли Samsung?" | `searchProduct` | query: "Samsung" | Availability query |

**Success Criteria**: ≥80% accuracy

### 5. Sales Tracking (2 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "купили 2 штуки iPhone" | `searchProduct` | query: "iPhone" | No recordSale tool yet |
| "продано 5 Samsung Galaxy" | `searchProduct` | query: "Samsung Galaxy" | No recordSale tool yet |

**Success Criteria**: ≥50% (fallback to search expected)

**Note**: These tests will inform Phase 2 implementation of `recordSale` tool.

### 6. Noise Filtering (3 tests)

| Command | Expected Behavior | Notes |
|---------|-------------------|-------|
| "привет ты тут?" | Text response (no tool call) | Greeting |
| "спасибо" | Text response (no tool call) | Thank you |
| "как дела?" | Text response (no tool call) | Small talk |

**Success Criteria**: 100% (must not call tools for noise)

### 7. Edge Cases (5 tests)

| Command | Expected Function | Parameters | Notes |
|---------|------------------|------------|-------|
| "добавь   " | Text response | - | Empty after sanitization |
| "удали несуществующий товар" | `deleteProduct` | productName: "несуществующий товар" | Will fail in execution |
| "iPhone" | `searchProduct` | query: "iPhone" | Single word intent |
| "add iphone for $1000 stock 5" | `addProduct` | name: "iphone", price: 1000, stock: 5 | English command |
| "list products" | `listProducts` | - | English command |

**Success Criteria**: ≥70% accuracy

## Performance Metrics

### Target Metrics
- **Latency**: <2 seconds per request
- **Token Usage**: <500 tokens average
- **Cost**: <$0.001 per request
- **Cache Hit Rate**: >50% (with prompt caching)
- **Overall Pass Rate**: ≥75%

### Monitored Metrics
```javascript
{
  prompt_tokens: number,
  completion_tokens: number,
  total_tokens: number,
  prompt_cache_hit_tokens: number,
  prompt_cache_miss_tokens: number,
  latency_ms: number,
  cost_usd: number
}
```

## Execution Instructions

### Run Tests

```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/bot

# Run the test suite
node tests/deepseek-prompt-test.js

# Expected output:
# - Colored terminal output with test results
# - Per-test metrics (latency, tokens, cost)
# - Category breakdown
# - Final summary with recommendations
```

### Add NPM Script (Optional)

```json
{
  "scripts": {
    "test:deepseek": "node tests/deepseek-prompt-test.js"
  }
}
```

Then run: `npm run test:deepseek`

## Expected Output Format

### Per-Test Output
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test: Add product with RUB currency and stock
Command: "добавь iPhone 15 за 50000₽ количество 10"
Expected: addProduct
✓ PASS
Function Called: addProduct
Arguments: {
  "name": "iPhone 15",
  "price": 50000,
  "stock": 10
}
Metrics:
  - Latency: 1234ms
  - Tokens: 456 (prompt: 300, completion: 156)
  - Cache: HIT (hit: 250, miss: 50)
  - Cost: $0.000234
```

### Final Summary
```
==========================================================
FINAL SUMMARY
==========================================================

Tests Run: 24
Passed: 19 (79.2%)
Failed: 4
Errors: 1

Performance:
  - Avg Latency: 1567ms
  - Avg Tokens: 412
  - Total Cost: $0.0034
  - Cache Hit Rate: 58.3%

Category Breakdown:
  basicCRUD: 4/5 (80%)
  bulkOperations: 1/2 (50%)
  updates: 2/3 (67%)
  queries: 3/4 (75%)
  salesTracking: 1/2 (50%)
  noiseFiltering: 3/3 (100%)
  edgeCases: 4/5 (80%)

Failed/Error Tests:
  ✗ [bulkOperations] Bulk add (should add first)
    Command: "добавь 3 товара: iPhone 500$, Samsung 400$, Xiaomi 300$"
    Expected: addProduct, Got: text_response

Recommendations:
  ! Add updateProduct and updateStock tools for better update handling
  ! Add bulk operation tools (deleteMultiple, addMultiple)
  ! Add recordSale tool for sales tracking
  ✓ Overall performance is good (79.2% pass rate)
```

## Analysis Deliverables

After running tests, analyze and document:

### 1. Function Selection Accuracy
- Which commands were correctly mapped to functions?
- Common misclassifications?
- Pattern of confusion (e.g., update vs search)?

### 2. Parameter Extraction Quality
- Are prices extracted correctly (RUB/USD conversion)?
- Stock quantities parsed accurately?
- Product names preserved with correct casing?

### 3. Russian Language Understanding
- Does AI handle Cyrillic input well?
- Price formats ("50000₽", "50000 рублей", "50 тысяч")?
- Common Russian product command patterns?

### 4. Ambiguity Handling
- Does AI correctly identify multiple matches?
- Does it fallback to `searchProduct` for clarification?
- Are error messages clear?

### 5. Performance Analysis
- Latency distribution (p50, p95, p99)?
- Token usage patterns (prompt vs completion)?
- Cache effectiveness (hit rate trends)?
- Cost per command type?

### 6. Failure Analysis
- Which command types fail most?
- Are failures consistent or random?
- Root causes (prompt ambiguity, missing tools, etc.)?

### 7. Prompt Improvement Recommendations
- Specific changes to `systemPrompts.js`?
- Additional examples needed?
- Tool descriptions needing clarification?
- New tools to add for Phase 2?

## Phase 2 Implementation Plan

Based on test results, prioritize:

### High Priority (if pass rate <70%)
- **updateProduct** tool (price, name, stock updates)
- **recordSale** tool (decrease stock quantity)
- Prompt refinements for failed categories

### Medium Priority (if pass rate 70-85%)
- **deleteMultiple** tool (bulk delete)
- **addMultiple** tool (bulk add)
- **updateStock** tool (dedicated stock management)

### Low Priority (if pass rate >85%)
- Advanced features (categories, tags, search filters)
- Multi-language improvements
- Context-aware suggestions

## Success Criteria

### Minimum Viable (Phase 1)
- ✅ basicCRUD: ≥80%
- ✅ queries: ≥80%
- ✅ noiseFiltering: 100%
- ✅ Overall: ≥75%
- ✅ Latency: <2s

### Production Ready (Phase 2)
- ✅ All categories: ≥85%
- ✅ updates: ≥80% (with updateProduct tool)
- ✅ salesTracking: ≥80% (with recordSale tool)
- ✅ Overall: ≥90%
- ✅ Latency: <1.5s
- ✅ Cache hit rate: >70%

## Next Steps

1. **Run tests** - Execute test suite and capture full output
2. **Analyze results** - Document findings in `DEEPSEEK_TEST_RESULTS.md`
3. **Identify improvements** - List specific prompt/tool changes
4. **Prioritize Phase 2** - Decide which tools to implement next
5. **Update prompts** - Refine based on failure analysis
6. **Re-test** - Validate improvements with new test run

## Files

- **Test Script**: `/bot/tests/deepseek-prompt-test.js`
- **Service**: `/bot/src/services/productAI.js`
- **Prompts**: `/bot/src/utils/systemPrompts.js`
- **Tools**: `/bot/src/tools/productTools.js`
- **DeepSeek Client**: `/bot/src/services/deepseek.js`
