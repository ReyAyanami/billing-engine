# How to Run New E2E Tests

## 🚀 Quick Start

### Option 1: Run the Helper Script (Easiest)

```bash
./test/e2e-new/run-poc.sh
```

### Option 2: Run Directly with npm

```bash
# Run just the topup tests (POC)
npm run test:e2e:new -- topup

# Run in watch mode (auto-rerun on changes)
npm run test:e2e:new:watch -- topup

# Run all new tests
npm run test:e2e:new

# Run with coverage
npm run test:e2e:new -- --coverage
```

---

## ✅ Prerequisites

Before running the tests, ensure:

1. **Database is running**
   ```bash
   # Check if PostgreSQL is running
   pg_isready -h localhost -p 5432
   
   # Or start with Docker
   docker-compose up -d
   ```

2. **Dependencies installed**
   ```bash
   npm install
   ```

3. **Environment variables set** (`.env` file)
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_DATABASE=billing_engine
   DB_SSL=false
   ```

---

## 📊 What to Expect

### Success Output

```
E2E Tests (New Architecture) › test/e2e-new/features/transactions/topup.e2e.spec.ts
  Feature: Account Top-up
    Scenario: Successful top-up
      ✓ should increase account balance by top-up amount (1245ms)
      ✓ should work with multiple sequential top-ups (2103ms)
      ✓ should support different currencies (1876ms)
      ✓ should handle decimal amounts correctly (1124ms)
    Scenario: Invalid account
      ✓ should reject top-up for non-existent account (312ms)
    Scenario: Currency mismatch
      ✓ should reject top-up with different currency (423ms)
      ✓ should reject top-up with unsupported currency (378ms)
    Scenario: Inactive account
      ✓ should reject top-up for suspended account (1532ms)
      ✓ should reject top-up for closed account (1498ms)
    Scenario: Duplicate requests (Idempotency)
      ✓ should handle duplicate top-up requests idempotently (2287ms)
      ✓ should allow different requests with different idempotency keys (2145ms)
    Scenario: Balance limits
      ✓ should reject top-up that exceeds maximum balance (456ms)
      ✓ should allow top-up up to maximum balance (1234ms)
      ✓ should enforce cumulative balance limits (1876ms)
    Scenario: Edge cases
      ✓ should reject top-up with zero amount (289ms)
      ✓ should reject top-up with negative amount (301ms)
      ✓ should handle very small amounts (cryptocurrency precision) (987ms)
      ✓ should handle very large amounts (1123ms)
    Scenario: Double-entry bookkeeping
      ✓ should record both sides of the transaction (1456ms)

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        25.789 s

✨ Done!
```

### Expected Metrics

- **Test Count**: 19 tests across 8 scenarios
- **Execution Time**: ~25-30 seconds
- **Success Rate**: 100% (all tests should pass)

---

## 🐛 Troubleshooting

### Problem: "Cannot connect to database"

**Solution:**
```bash
# Start PostgreSQL
docker-compose up -d

# Or check your local PostgreSQL service
brew services start postgresql  # macOS
sudo service postgresql start   # Linux
```

### Problem: "Module not found"

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Problem: "Tests timeout"

**Cause**: Database slow or sagas not completing

**Solution:**
```bash
# Check database performance
# Ensure no other heavy processes running
# Increase timeout in jest config if needed
```

### Problem: "Transaction rollback error"

**Cause**: Previous test didn't clean up properly

**Solution:**
```bash
# Manually clean database
npm run migration:revert
npm run migration:run

# Or reset database completely
docker-compose down -v
docker-compose up -d
```

---

## 🔍 Verify Test Quality

After running tests, check:

1. ✅ **All tests pass** (no failures)
2. ✅ **No timeouts** (tests complete within 30s total)
3. ✅ **No flaky tests** (run multiple times, should be consistent)
4. ✅ **Clear output** (easy to see what passed/failed)
5. ✅ **Good performance** (~1-2s per test average)

### Run Multiple Times to Check Consistency

```bash
# Run 5 times in a row
for i in {1..5}; do
  echo "Run $i/5"
  npm run test:e2e:new -- topup
done
```

All 5 runs should pass with similar timing.

---

## 📈 Next Steps After POC Verification

Once POC tests pass successfully:

1. **Review with team** - Get feedback on approach
2. **Start Phase 2** - Implement account management tests
3. **Follow pattern** - Use topup test as template
4. **Expand coverage** - Add withdrawal, transfer, payment, refund

See `E2E_IMPLEMENTATION_ROADMAP.md` for detailed plan.

---

## 💡 Tips

1. **Use watch mode** during development:
   ```bash
   npm run test:e2e:new:watch -- topup
   ```

2. **Run specific test** by name:
   ```bash
   npm run test:e2e:new -- -t "should increase account balance"
   ```

3. **See verbose output**:
   ```bash
   npm run test:e2e:new -- --verbose topup
   ```

4. **Debug specific test**:
   ```bash
   npm run test:e2e:new -- --detectOpenHandles topup
   ```

---

## 🎯 Success Criteria

POC is successful if:
- ✅ All 19 tests pass
- ✅ Total time < 30 seconds
- ✅ Tests can run multiple times consistently
- ✅ No manual intervention needed
- ✅ Clear, readable output

**If all criteria met → Proceed to Phase 2!** 🚀


