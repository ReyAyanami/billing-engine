# 🚀 Scriptless Startup Guide

## Overview

The Billing Engine now features **fully automated, scriptless startup**. No need to remember which scripts to run or in what order. Everything is orchestrated automatically through Docker Compose.

## 🎯 Two Deployment Modes

### Local Development (Default)
Infrastructure runs in Docker, your app runs locally with hot reload:
```bash
npm run env:start    # Start infrastructure
npm run dev          # Run app locally with hot reload
```

Or combined:
```bash
npm start            # Does both automatically!
```

### Staging/Production
Everything runs in Docker including the app:
```bash
npm run start:staging
```

## ✨ What Happens Automatically (Local Dev)

When you run `npm start` or `npm run env:start`, the system automatically:

1. **Starts PostgreSQL** with health checks
2. **Starts Kafka** (KRaft mode - no Zookeeper needed!)
3. **Waits for services** to be healthy
4. **Creates Kafka topics** automatically
5. **Runs database migrations** automatically
6. **Ready for your app** to connect!

Then `npm run dev` starts your app locally with hot reload.

## 🎯 Quick Start

### Local Development (Recommended)

**Start infrastructure and app:**
```bash
npm start
# This runs: npm run env:start && npm run dev
```

**Or step by step:**
```bash
npm run env:start    # Start infrastructure (PostgreSQL, Kafka)
npm run dev          # Start app with hot reload
```

**View logs:**
```bash
npm run env:logs     # Infrastructure logs
# App logs are in your terminal
```

**Stop:**
```bash
npm run env:stop     # Stop infrastructure
# Ctrl+C to stop app
```

### Staging/Production Deployment

**Start full stack:**
```bash
npm run start:staging           # Interactive
npm run start:staging:detached  # Background
```

**View logs:**
```bash
npm run logs:staging
```

**Stop:**
```bash
npm run stop:staging
```

## 📋 Available Commands

### Local Development Commands

**Environment (Infrastructure):**
- **`npm run env:start`** - Start PostgreSQL, Kafka, init (creates topics, runs migrations)
- **`npm run env:stop`** - Stop infrastructure
- **`npm run env:clean`** - Stop and remove volumes (clean slate)
- **`npm run env:status`** - Check infrastructure status
- **`npm run env:logs`** - View infrastructure logs
- **`npm run env:ui`** - Start with Kafka UI for debugging

**Application:**
- **`npm run dev`** - Run app locally with hot reload
- **`npm run dev:debug`** - Run app with debugging enabled
- **`npm start`** - Start infrastructure + app (combined)

### Staging/Production Commands

- **`npm run start:staging`** - Start full stack (interactive)
- **`npm run start:staging:detached`** - Start full stack (background)
- **`npm run stop:staging`** - Stop staging environment
- **`npm run logs:staging`** - View application logs

## 🔍 Service Access Points

**Local Development:**
- **Application API**: http://localhost:3000 (when running `npm run dev`)
- **API Documentation**: http://localhost:3000/api/docs
- **PostgreSQL**: localhost:5432
- **Kafka**: localhost:9092

**With Kafka UI** (`npm run env:ui`):
- **Kafka UI**: http://localhost:8080

**Staging/Production:**
- Same as above when running `npm run start:staging`

## 📊 Architecture

### Local Development Mode (docker-compose.yml)

```
┌─────────────┐
│  PostgreSQL │ ← Health check
└──────┬──────┘
       │
┌──────▼──────┐
│    Kafka    │ ← Health check
└──────┬──────┘
       │
┌──────▼──────┐
│    Init     │ ← Run once:
│ Container   │   • Create topics
└──────┬──────┘   • Run migrations
       │
       │ (Infrastructure ready!)
       │
┌──────▼──────┐
│   Your App  │ ← Run with npm run dev
│   (Local)   │   • Hot reload
└─────────────┘   • Easy debugging
```

### Staging/Production Mode (docker-compose.staging.yml)

```
┌─────────────┐
│  PostgreSQL │ ← Health check
└──────┬──────┘
       │
┌──────▼──────┐
│    Kafka    │ ← Health check
└──────┬──────┘
       │
┌──────▼──────┐
│    Init     │ ← Run once:
│ Container   │   • Create topics
└──────┬──────┘   • Run migrations
       │
┌──────▼──────┐
│   Billing   │ ← Runs in Docker
│  App (Docker)│  • Auto-restart
└─────────────┘  • Production ready
```

### Key Components

1. **Health Checks**: Services only start after dependencies are healthy
2. **Init Container**: Runs setup tasks once, then completes
3. **Dependency Ordering**: Using `depends_on` with conditions
4. **Volume Caching**: Init container caches node_modules for speed

## 🛠️ Troubleshooting

### "Services not starting"

Check Docker is running:
```bash
docker info
```

### "Port already in use"

Stop any existing services:
```bash
npm run stop:clean
```

### "Migration errors"

Clean slate restart:
```bash
npm run stop:clean
npm start
```

### "Init container fails"

View init logs:
```bash
docker-compose logs init
```

### View specific service logs

```bash
docker-compose logs postgres
docker-compose logs kafka
docker-compose logs app
```

## 🔧 Customization

### Environment Variables

Create a `.env` file (optional - Docker Compose has defaults):

```env
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=billing_engine
PORT=3000
NODE_ENV=development
KAFKA_BROKERS=kafka:9092
```

### Modify docker-compose.yml

The `docker-compose.yml` file is well-documented. You can:
- Change port mappings
- Adjust health check intervals
- Add more services
- Modify environment variables

## ⚡ Performance Notes

### First Start
- Takes ~2-3 minutes (building images, initializing databases)
- Subsequent starts are much faster (~30 seconds)

### Development Workflow
Recommended approach for fastest iteration:

1. Start infrastructure once: `npm run env:start`
2. Run app locally: `npm run dev`
3. Make code changes → auto-reload!
4. Stop when done: `npm run env:stop`

This gives you:
- ✅ Hot reload (instant changes)
- ✅ Easy debugging
- ✅ Fast iteration
- ✅ Infrastructure in Docker (consistent)

## 🎓 Benefits

### No Scripts to Forget
- ❌ Old way: Run 5 different scripts in order
- ✅ New way: `npm start`

### Proper Dependency Management
- Services start in correct order
- Health checks prevent premature startup
- Automatic retries and error handling

### Consistency
- Same startup process for everyone
- No "works on my machine" issues
- Easy onboarding for new developers

### Production-Ready
- Same Docker images can be used in production
- Environment-specific configuration via env vars
- No script dependencies

## 📚 Related Documentation

- [Quick Start Guide](./QUICK_START.md) - General getting started guide
- [README](./README.md) - Main project documentation
- [Scripts Guide](./SCRIPTS_GUIDE.md) - Legacy script documentation (now optional)

## 🤝 Contributing

If you add new dependencies or initialization steps:

1. Add them to `scripts/init-services.sh`
2. Update this documentation
3. Test with `npm run stop:clean && npm start`

## 💡 FAQ

**Q: Can I still use the old scripts?**  
A: Yes! They're still in the `scripts/` directory, but not needed anymore.

**Q: How do I run tests?**  
A: Tests still use the existing commands:
```bash
npm run test        # Unit tests
npm run test:e2e    # E2E tests
```

**Q: Does this work in production?**  
A: Yes! Use the same Docker images with production environment variables.

**Q: How do I reset everything?**  
A: `npm run stop:clean` removes all data and containers. Then `npm start` for fresh setup.

**Q: Can I develop without Docker?**  
A: Yes! Start services with Docker, then use `npm run dev` for local development.

---

**🎉 Enjoy your scriptless startup experience!**

