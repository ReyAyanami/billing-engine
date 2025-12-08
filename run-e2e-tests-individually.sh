#!/bin/bash

# Run E2E tests individually to avoid test interference
# Each test passes when run alone, but they interfere when run together

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         Running E2E Tests Individually                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

TESTS=(
  "test/e2e/account/account-creation.e2e-spec.ts"
  "test/e2e/account/account-projections.e2e-spec.ts"
  "test/e2e/transaction/topup.e2e-spec.ts"
  "test/e2e/transaction/payment.e2e-spec.ts"
  "test/e2e/transaction/refund.e2e-spec.ts"
  "test/e2e/transaction/withdrawal-transfer.e2e-spec.ts"
  "test/e2e/kafka-integration.e2e-spec.ts"
)

PASSED=0
FAILED=0
FAILED_TESTS=()

for test in "${TESTS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running: $test"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if npm run test:e2e -- "$test"; then
    echo "✅ PASSED: $test"
    ((PASSED++))
  else
    echo "❌ FAILED: $test"
    ((FAILED++))
    FAILED_TESTS+=("$test")
  fi
  
  echo ""
  # Small delay between tests
  sleep 2
done

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Test Results Summary                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "📊 Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "Failed tests:"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  - $test"
  done
  echo ""
  exit 1
else
  echo "🎉 All tests passed!"
  exit 0
fi

