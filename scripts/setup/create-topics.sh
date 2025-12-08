#!/bin/bash

# Billing Engine - Kafka Topic Creation
# Creates all required topics with proper configuration for event sourcing

set -e

BOOTSTRAP_SERVERS="localhost:9092,localhost:9093,localhost:9094"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Billing Engine - Kafka Topic Setup                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Function to create topic with proper configuration
create_topic() {
  local topic_name=$1
  local partitions=$2
  local description=$3
  
  echo "Creating: $topic_name"
  echo "  Description: $description"
  echo "  Partitions: $partitions, Replication: 3, Min ISR: 2"
  
  docker exec billing-kafka-1 kafka-topics --create \
    --bootstrap-server $BOOTSTRAP_SERVERS \
    --topic $topic_name \
    --partitions $partitions \
    --replication-factor 3 \
    --config retention.ms=-1 \
    --config min.insync.replicas=2 \
    --config compression.type=lz4 \
    --config cleanup.policy=compact,delete \
    --if-not-exists
  
  echo "  ✅ Created: $topic_name"
  echo ""
}

# Event Sourcing Topics
echo "📋 Creating Event Sourcing Topics..."
echo ""

create_topic "billing.account.events" 10 \
  "Account aggregate events (created, balance changed, status changed)"

create_topic "billing.transaction.events" 10 \
  "Transaction aggregate events (topup, withdrawal, transfer, refund)"

create_topic "billing.saga.events" 5 \
  "Saga coordination events (transfer, refund workflows)"

create_topic "billing.dead-letter" 1 \
  "Failed events for manual review and reprocessing"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "                   ALL TOPICS CREATED                            "
echo "════════════════════════════════════════════════════════════════"
echo ""

# List all billing topics
echo "📋 Billing Engine Topics:"
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  | grep "^billing\." || echo "  No billing topics found"

echo ""
echo "📊 Topic Configuration Details:"
echo ""

# Describe each topic
for topic in "billing.account.events" "billing.transaction.events" "billing.saga.events" "billing.dead-letter"; do
  echo "─────────────────────────────────────────────────────────────────"
  docker exec billing-kafka-1 kafka-topics --describe \
    --bootstrap-server $BOOTSTRAP_SERVERS \
    --topic $topic
  echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "✅ All topics created and configured!"
echo ""
echo "🌐 View in Kafka UI:      http://localhost:8080"
echo "📊 View metrics:          http://localhost:9090 (Prometheus)"
echo "📈 View dashboards:       http://localhost:3000 (Grafana)"
echo ""
echo "📋 Next Steps:"
echo "   • Run migrations:        npm run migration:run"
echo "   • Start application:     npm run start:dev"
echo "   • Run E2E tests:         ./scripts/test/run-e2e.sh"
echo "════════════════════════════════════════════════════════════════"
echo ""

