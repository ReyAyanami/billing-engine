#!/bin/bash

# Billing Engine - E2E Test Runner
# Runs all E2E tests with proper environment setup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Billing Engine - E2E Test Suite                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# Check if services are running
echo "🔍 Checking if services are running..."
if ! docker-compose ps | grep -q "billing-kafka-1"; then
  echo "⚠️  Services are not running!"
  echo ""
  read -p "Start services now? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting services..."
    ./scripts/start.sh
  else
    echo "❌ Cannot run tests without services"
    exit 1
  fi
fi

echo "✅ Services are running"
echo ""

# Run tests
echo "🧪 Running E2E tests..."
echo ""

npm run test:e2e

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ E2E tests completed!"
echo "════════════════════════════════════════════════════════════════"
echo ""

