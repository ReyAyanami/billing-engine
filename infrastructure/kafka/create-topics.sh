#!/bin/bash

# Kafka Topic Creation Script for Billing Engine
# Creates all required topics with proper configuration for event sourcing

set -e

BOOTSTRAP_SERVERS="localhost:9092,localhost:9093,localhost:9094"

echo "🚀 Creating Kafka topics for Billing Engine Event Sourcing..."
echo ""

# Function to create topic
create_topic() {
  local topic_name=$1
  local partitions=$2
  local description=$3
  
  echo "Creating: $topic_name ($description)"
  
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
  
  echo "✅ Created: $topic_name"
  echo ""
}

# Account Events
create_topic "billing.account.events" 10 "Account aggregate events (created, balance changed, status changed)"

# Transaction Events  
create_topic "billing.transaction.events" 10 "Transaction aggregate events (topup, withdrawal, transfer, refund)"

# Saga Events
create_topic "billing.saga.events" 5 "Saga coordination events (transfer, refund workflows)"

# Dead Letter Queue
create_topic "billing.dead-letter" 1 "Failed events for manual review"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "                   ALL TOPICS CREATED                          "
echo "══════════════════════════════════════════════════════════════"
echo ""

# List all billing topics
echo "📋 Billing Engine Topics:"
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  | grep "^billing\."

echo ""
echo "📊 Topic Details:"
echo ""

# Describe each topic
for topic in "billing.account.events" "billing.transaction.events" "billing.saga.events" "billing.dead-letter"; do
  echo "─────────────────────────────────────────────────────────────"
  docker exec billing-kafka-1 kafka-topics --describe \
    --bootstrap-server $BOOTSTRAP_SERVERS \
    --topic $topic
  echo ""
done

echo "══════════════════════════════════════════════════════════════"
echo "✅ All topics created and configured for event sourcing!"
echo ""
echo "📺 View in Kafka UI: http://localhost:8080"
echo "📊 View metrics: http://localhost:9090 (Prometheus)"
echo "📈 View dashboards: http://localhost:3000 (Grafana)"
echo "══════════════════════════════════════════════════════════════"

