#!/bin/bash

# Start Development Environment
# Simple script to start all services

echo "🚀 Starting Development Environment..."
echo ""

# Start services
docker-compose up -d

# Show status
echo ""
echo "📊 Services:"
docker-compose ps
echo ""

echo "✅ Environment Started!"
echo ""
echo "🔗 Access:"
echo "   PostgreSQL:  localhost:5432"
echo "   Kafka:       localhost:9092"
echo "   Kafka UI:    http://localhost:8080 (if using --profile debug)"
echo ""
echo "🎯 Next:"
echo "   npm run start:dev    # Start the app"
echo "   npm run test:e2e:new # Run tests"
echo ""

