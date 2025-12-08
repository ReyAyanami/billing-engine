#!/bin/bash

# Reset Kafka and Run E2E Tests
# This script fully resets the Kafka cluster and runs tests with a clean state

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Kafka Reset & E2E Test Runner"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Stop and remove everything
echo "📦 Step 1: Stopping Kafka cluster and removing volumes..."
docker-compose down -v

echo ""
echo "✅ Kafka cluster stopped and volumes removed"
echo ""

# Step 2: Start fresh
echo "🚀 Step 2: Starting fresh Kafka cluster..."
docker-compose up -d

echo ""
echo "⏳ Waiting for brokers to be healthy (30 seconds)..."
sleep 30

# Step 3: Check health
echo ""
echo "🏥 Step 3: Checking broker health..."
docker-compose ps

echo ""

# Step 4: Create topics
echo "📋 Step 4: Creating topics..."
if [ -f "./create-topics.sh" ]; then
  chmod +x create-topics.sh
  ./create-topics.sh
else
  echo "⚠️  Warning: create-topics.sh not found, skipping topic creation"
fi

echo ""

# Step 5: Verify topics
echo "📊 Step 5: Verifying topics..."
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server localhost:9092 \
  | grep "^billing\." || echo "No billing topics found"

echo ""

# Step 6: Run tests
echo "═══════════════════════════════════════════════════════════"
echo "  Running E2E Tests"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd ../..
npm run test:e2e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Test run complete"
echo "═══════════════════════════════════════════════════════════"

