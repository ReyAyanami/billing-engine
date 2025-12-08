#!/bin/bash

# Billing Engine - Reset and Test
# Completely resets the environment and runs E2E tests with a clean state
# Useful for ensuring tests pass in a fresh environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        Billing Engine - Reset & E2E Test Runner                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "This script will:"
echo "  1. Stop and remove all services and volumes"
echo "  2. Start fresh services"
echo "  3. Create Kafka topics"
echo "  4. Wait for services to stabilize"
echo "  5. Run E2E tests"
echo ""

cd "$ROOT_DIR"

# Step 1: Reset
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 1: Resetting environment"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🗑️  Stopping and removing all services..."
docker-compose down -v

echo ""
echo "✅ Environment reset complete"
echo ""

# Step 2: Start services
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 2: Starting fresh services"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 Starting all services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy (30 seconds)..."
sleep 30

# Step 3: Check health
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 3: Verifying service health"
echo "═══════════════════════════════════════════════════════════════"
echo ""
docker-compose ps

echo ""

# Step 4: Create topics
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 4: Creating Kafka topics"
echo "═══════════════════════════════════════════════════════════════"
echo ""
if [ -f "./scripts/setup/create-topics.sh" ]; then
  chmod +x ./scripts/setup/create-topics.sh
  ./scripts/setup/create-topics.sh
else
  echo "⚠️  Warning: create-topics.sh not found, skipping topic creation"
fi

echo ""

# Step 5: Verify topics
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 5: Verifying Kafka topics"
echo "═══════════════════════════════════════════════════════════════"
echo ""
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server localhost:9092 \
  | grep "^billing\." || echo "⚠️  No billing topics found"

echo ""

# Step 6: Additional stabilization time
echo "⏳ Waiting for services to fully stabilize (10 seconds)..."
sleep 10

echo ""

# Step 7: Run tests
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 6: Running E2E Tests"
echo "═══════════════════════════════════════════════════════════════"
echo ""

npm run test:e2e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Test Run Complete                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

