#!/bin/bash

# Billing Engine - Individual E2E Test Runner
# Runs each E2E test file individually to ensure isolation
# Useful for debugging test interference issues

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        Billing Engine - Individual E2E Test Runner             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# Define all test files
TESTS=(
  "test/e2e/account/account-creation.e2e-spec.ts"
  "test/e2e/account/account-projections.e2e-spec.ts"
  "test/e2e/transaction/topup.e2e-spec.ts"
  "test/e2e/transaction/withdrawal.e2e-spec.ts"
  "test/e2e/transaction/transfer.e2e-spec.ts"
  "test/e2e/transaction/payment.e2e-spec.ts"
  "test/e2e/transaction/refund.e2e-spec.ts"
  "test/e2e/kafka-integration.e2e-spec.ts"
)

PASSED=0
FAILED=0
FAILED_TESTS=()

echo "Running ${#TESTS[@]} test files individually..."
echo ""

for test in "${TESTS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🧪 Running: $test"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  if npm run test:e2e -- "$test"; then
    echo ""
    echo "✅ PASSED: $test"
    ((PASSED++))
  else
    echo ""
    echo "❌ FAILED: $test"
    ((FAILED++))
    FAILED_TESTS+=("$test")
  fi
  
  echo ""
  # Brief delay between tests
  sleep 2
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Test Results Summary                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passed: $PASSED / $((PASSED + FAILED))"
echo "❌ Failed: $FAILED / $((PASSED + FAILED))"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "Failed tests:"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  • $test"
  done
  echo ""
  exit 1
else
  echo "🎉 All tests passed!"
  echo ""
  exit 0
fi

