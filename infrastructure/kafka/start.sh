#!/bin/bash

# Billing Engine Kafka Cluster - Start Script
# This script starts the entire Kafka infrastructure

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Billing Engine - Kafka Cluster Startup                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Start the cluster
echo "🚀 Starting Kafka cluster (this may take 2-3 minutes)..."
echo ""
docker-compose up -d

echo ""
echo "⏳ Waiting for cluster to be healthy..."
echo ""

# Wait for services to be healthy
sleep 5

# Check services
echo "📊 Checking services..."
docker-compose ps

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "                   CLUSTER STARTED                            "
echo "══════════════════════════════════════════════════════════════"
echo ""

# Display access information
echo "🌐 Access Points:"
echo "   • Kafka Brokers:   localhost:9092, localhost:9093, localhost:9094"
echo "   • Schema Registry: http://localhost:8081"
echo "   • Kafka UI:        http://localhost:8080  👈 Open this!"
echo "   • Prometheus:      http://localhost:9090"
echo "   • Grafana:         http://localhost:3000 (admin/admin)"
echo ""

echo "📋 Next Steps:"
echo "   1. Wait 30-60 seconds for all services to be fully ready"
echo "   2. Run: ./create-topics.sh"
echo "   3. Open Kafka UI: http://localhost:8080"
echo "   4. Verify all 3 brokers are online"
echo ""

echo "📝 Useful Commands:"
echo "   • View logs:     docker-compose logs -f [service-name]"
echo "   • Stop cluster:  docker-compose stop"
echo "   • Restart:       docker-compose restart"
echo "   • Full cleanup:  docker-compose down -v"
echo ""

echo "══════════════════════════════════════════════════════════════"
echo "✅ Startup complete! Waiting for services to stabilize..."
echo "══════════════════════════════════════════════════════════════"
echo ""

# Optional: Open Kafka UI in browser
read -p "Open Kafka UI in browser? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🌐 Opening Kafka UI..."
  sleep 2
  if command -v open &> /dev/null; then
    open http://localhost:8080
  elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8080
  else
    echo "Please open http://localhost:8080 manually"
  fi
fi

echo ""
echo "🎉 Kafka cluster is starting up!"
echo "📖 See README.md for more details"

