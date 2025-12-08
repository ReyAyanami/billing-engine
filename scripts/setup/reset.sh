#!/bin/bash

# Billing Engine - Reset Script
# Completely resets all services and removes all data
# WARNING: This will delete all database data, Kafka messages, and volumes!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Billing Engine - RESET ALL SERVICES                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  WARNING: This will delete ALL data!"
echo ""
echo "   • PostgreSQL database data"
echo "   • All Kafka messages and topics"
echo "   • Monitoring data (Prometheus, Grafana)"
echo "   • All Docker volumes"
echo ""
read -p "Are you sure you want to continue? (yes/NO): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "❌ Reset cancelled"
  exit 0
fi

cd "$ROOT_DIR"

echo ""
echo "🗑️  Step 1: Stopping all services..."
docker-compose down

echo ""
echo "🗑️  Step 2: Removing all volumes..."
docker-compose down -v

echo ""
echo "✅ All services stopped and data removed"
echo ""
echo "📋 Next Steps:"
echo "   1. Start services:     ./scripts/start.sh"
echo "   2. Create topics:      ./scripts/setup/create-topics.sh"
echo "   3. Run migrations:     npm run migration:run"
echo "   4. Start application:  npm run start:dev"
echo ""

