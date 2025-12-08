#!/bin/bash

# Billing Engine - Stop Script
# Gracefully stops all services while preserving data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              Billing Engine - Stop Services                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

echo "🛑 Stopping all services..."
echo ""

docker-compose stop

echo ""
echo "✅ All services stopped (data preserved)"
echo ""
echo "📋 Next Steps:"
echo "   • Restart services:  ./scripts/start.sh"
echo "   • Remove all data:   ./scripts/setup/reset.sh"
echo "   • View status:       docker-compose ps"
echo ""

