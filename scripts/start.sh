#!/bin/bash

# Billing Engine - Main Startup Script
# Starts all required services: PostgreSQL, Kafka, monitoring tools

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Billing Engine - Startup Script                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Navigate to project root
cd "$ROOT_DIR"

# Start all services
echo "🚀 Starting all services..."
echo "   • PostgreSQL database"
echo "   • Kafka cluster (3 brokers)"
echo "   • Zookeeper"
echo "   • Schema Registry"
echo "   • Kafka UI"
echo "   • Prometheus"
echo "   • Grafana"
echo ""
echo "⏳ This may take 2-3 minutes..."
echo ""

docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy (30 seconds)..."
sleep 30

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "                    SERVICES STARTED                             "
echo "════════════════════════════════════════════════════════════════"
echo ""

# Display access information
echo "🌐 Access Points:"
echo ""
echo "   Database:"
echo "     • PostgreSQL:      localhost:5432"
echo "     • User:            postgres"
echo "     • Password:        postgres"
echo "     • Database:        billing_engine"
echo ""
echo "   Kafka:"
echo "     • Brokers:         localhost:9092, localhost:9093, localhost:9094"
echo "     • Schema Registry: http://localhost:8081"
echo "     • Kafka UI:        http://localhost:8080  👈 Recommended"
echo ""
echo "   Monitoring:"
echo "     • Prometheus:      http://localhost:9090"
echo "     • Grafana:         http://localhost:3000 (admin/admin)"
echo ""

echo "📋 Next Steps:"
echo "   1. Create Kafka topics:    ./scripts/setup/create-topics.sh"
echo "   2. Run database migrations: npm run migration:run"
echo "   3. Start the application:   npm run start:dev"
echo ""

echo "📝 Useful Commands:"
echo "   • View logs:       docker-compose logs -f [service-name]"
echo "   • Stop services:   ./scripts/stop.sh"
echo "   • Reset services:  ./scripts/setup/reset.sh"
echo "   • Run tests:       ./scripts/test/run-e2e.sh"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "✅ Startup complete! All services are starting up..."
echo "════════════════════════════════════════════════════════════════"
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
echo "🎉 All services are up and running!"
echo "📖 See README.md or QUICK_START.md for more details"
echo ""

