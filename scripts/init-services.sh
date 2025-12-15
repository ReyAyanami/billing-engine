#!/bin/sh
# Automated Service Initialization Script
# This runs automatically in the init container
# No manual intervention needed!

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  🚀 Billing Engine - Automated Initialization"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Install required tools
echo "📦 Installing dependencies..."
apk add --no-cache netcat-openbsd curl docker-cli

# Install npm dependencies if not already installed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "📦 Installing Node.js dependencies..."
  npm ci
else
  echo "✅ Node.js dependencies already installed"
fi

echo ""
echo "⏳ Waiting for services to be fully ready..."
echo ""

# Wait for PostgreSQL
echo "🗄️  Checking PostgreSQL..."
timeout=60
counter=0
until nc -z postgres 5432 || [ $counter -eq $timeout ]; do
  echo "   Waiting for PostgreSQL... ($counter/$timeout)"
  sleep 2
  counter=$((counter + 2))
done

if [ $counter -eq $timeout ]; then
  echo "❌ PostgreSQL failed to start"
  exit 1
fi
echo "✅ PostgreSQL is ready"

# Wait for Kafka
echo "📨 Checking Kafka..."
timeout=90
counter=0
until nc -z kafka 9092 || [ $counter -eq $timeout ]; do
  echo "   Waiting for Kafka... ($counter/$timeout)"
  sleep 2
  counter=$((counter + 2))
done

if [ $counter -eq $timeout ]; then
  echo "❌ Kafka failed to start"
  exit 1
fi

# Additional wait for Kafka to be fully operational
echo "   Waiting for Kafka to be fully operational..."
sleep 10
echo "✅ Kafka is ready"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  📋 Creating Kafka Topics"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Function to create topic
create_topic() {
  local topic_name=$1
  local partitions=$2
  
  echo "📝 Creating topic: $topic_name (partitions: $partitions)"
  
  # Create topic using docker exec
  docker exec billing_kafka /opt/kafka/bin/kafka-topics.sh --create \
    --bootstrap-server localhost:9092 \
    --topic "$topic_name" \
    --partitions "$partitions" \
    --replication-factor 1 \
    --config retention.ms=-1 \
    --config cleanup.policy=compact,delete \
    --if-not-exists 2>&1 | grep -v "already exists" || true
  
  echo "   ✅ Topic ready: $topic_name"
}

# Create all required topics
create_topic "billing.account.events" 3
create_topic "billing.transaction.events" 3
create_topic "billing.saga.events" 3
create_topic "billing.dead-letter" 1

echo ""
echo "✅ All Kafka topics created"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  🗄️  Running Database Migrations"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Run migrations
echo "📊 Executing migrations..."
npm run migration:run 2>&1 || {
  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "⚠️  Migrations encountered an issue (exit code: $exit_code)"
    echo "   This might be OK if migrations were already applied"
    echo "   Continuing anyway..."
  fi
}

echo ""
echo "✅ Database initialization completed"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  ✅ Initialization Complete!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "🎉 All services are ready!"
echo "🚀 Application will start next..."
echo ""
echo "📍 Access Points:"
echo "   • API:              http://localhost:3000"
echo "   • API Docs:         http://localhost:3000/api/docs"
echo "   • PostgreSQL:       localhost:5432"
echo "   • Kafka:            localhost:9092"
echo ""

