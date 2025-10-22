# DeepSeek Testing - Execution Plan

## What I've Prepared

### 1. Comprehensive Test Script ✅
**File**: `/bot/tests/deepseek-prompt-test.js`

**Features**:
- 24 test cases across 7 categories
- Real DeepSeek API integration
- Colored terminal output
- Detailed metrics tracking (latency, tokens, cost, cache hits)
- Per-test and category-level reporting
- Automatic recommendations based on results

**Test Coverage**:
- ✅ Basic CRUD (5 tests)
- ✅ Bulk operations (2 tests)
- ✅ Update operations (3 tests)
- ✅ Query operations (4 tests)
- ✅ Sales tracking (2 tests)
- ✅ Noise filtering (3 tests)
- ✅ Edge cases (5 tests)

### 2. Testing Plan Documentation ✅
**File**: `/bot/DEEPSEEK_TESTING_PLAN.md`

**Contents**:
- Test objectives and success criteria
- Detailed test case specifications
- Expected output formats
- Performance metrics targets
- Phase 2 implementation priorities
- Failure analysis framework

## What Will Happen When You Run Tests

### Step 1: Test Execution
```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/bot
node tests/deepseek-prompt-test.js
```

**Process** (estimated 2-3 minutes):
1. Validates DeepSeek API configuration
2. Runs 24 test cases sequentially
3. Makes real API calls to DeepSeek
4. Tracks metrics for each call
5. Analyzes results per category
6. Generates final summary with recommendations

**What You'll See**:
- Colored terminal output (green=pass, red=fail)
- Each test shows:
  - Command and expected function
  - Actual function called
  - Extracted parameters (JSON)
  - AI response message
  - Metrics (latency, tokens, cost, cache status)
- Category summaries
- Overall pass rate and recommendations

### Step 2: Results Analysis

**I will analyze**:
1. **Function Selection Accuracy**
   - Which commands mapped correctly?
   - Common misclassifications?
   - Pattern identification

2. **Parameter Extraction Quality**
   - Price parsing (RUB/USD, symbols)
   - Stock quantity extraction
   - Product name preservation

3. **Russian Language Understanding**
   - Cyrillic handling
   - Natural language variations
   - Currency format flexibility

4. **Performance Metrics**
   - Latency distribution
   - Token efficiency
   - Cost analysis
   - Cache effectiveness

5. **Failure Patterns**
   - Most problematic command types
   - Root cause analysis
   - Missing tool identification

### Step 3: Deliverables

**I will create**:
1. **DEEPSEEK_TEST_RESULTS.md** - Full test report with:
   - Raw test output
   - Metrics summary
   - Pass/fail breakdown
   - Sample API responses

2. **PROMPT_IMPROVEMENTS.md** - Recommendations with:
   - Specific prompt changes
   - New tool proposals (updateProduct, recordSale, etc.)
   - Priority ranking for Phase 2
   - Code snippets for implementation

## Cost Estimate

**Per test**: ~$0.0002-0.0005 (with cache: ~$0.0001)
**Total 24 tests**: ~$0.005-0.01 (approximately 1 cent)

## Risks & Mitigations

### API Rate Limiting
- **Risk**: 429 errors if too fast
- **Mitigation**: 500ms delay between tests

### API Unavailable
- **Risk**: 503 errors (server overload)
- **Mitigation**: 3 retries with exponential backoff

### Timeout
- **Risk**: Slow responses >10s
- **Mitigation**: 10s timeout configured

### Invalid API Key
- **Risk**: 401 errors
- **Mitigation**: Pre-flight check before tests run

## Success Criteria

### Minimum (Phase 1 MVP)
- [ ] Overall pass rate ≥75%
- [ ] Basic CRUD ≥80%
- [ ] Noise filtering 100%
- [ ] Average latency <2s

### Ideal (Production Ready)
- [ ] Overall pass rate ≥85%
- [ ] All categories ≥70%
- [ ] Average latency <1.5s
- [ ] Cache hit rate >50%

## Next Steps After Testing

### If Pass Rate ≥85% (Good)
1. Document successful patterns
2. Implement minor prompt refinements
3. Add polish features (better error messages)
4. Deploy to staging

### If Pass Rate 70-84% (Moderate)
1. Analyze failed categories
2. Refine prompts for weak areas
3. Consider adding 1-2 new tools (updateProduct, recordSale)
4. Re-test and iterate

### If Pass Rate <70% (Needs Work)
1. Deep dive on failure patterns
2. Major prompt restructuring
3. Add missing tools as priority
4. Consider alternative model/approach
5. Re-test with new implementation

## Ready to Execute?

Once approved, I will:
1. ✅ Run the test suite (2-3 minutes)
2. ✅ Capture full output
3. ✅ Analyze results
4. ✅ Generate recommendations
5. ✅ Provide Phase 2 implementation plan

**Command to run**:
```bash
cd /Users/sile/Documents/Status\ Stock\ 4.0/bot
node tests/deepseek-prompt-test.js
```
