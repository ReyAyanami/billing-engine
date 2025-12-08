# Local Development vs Staging/Production

This document explains the two deployment modes and when to use each.

## 🎯 Two Deployment Modes

### 📍 Local Development (Default)

**Infrastructure in Docker + App runs locally**

```bash
# Start infrastructure
npm run env:start

# Run app locally with hot reload
npm run dev
```

**Files used:**
- `docker-compose.yml` - Infrastructure only (PostgreSQL, Kafka, Init)
- Your app runs locally via `npm run dev`

**Use when:**
- 🔧 Developing features
- 🐛 Debugging issues
- 🧪 Running tests locally
- ⚡ Need hot reload
- 🎯 Daily development work

**Benefits:**
- ✅ Instant hot reload on code changes
- ✅ Easy debugging with breakpoints
- ✅ Faster iteration cycle
- ✅ Less Docker overhead
- ✅ Direct access to node_modules
- ✅ IDE integration works perfectly

### 🚀 Staging/Production

**Everything runs in Docker**

```bash
# Start full stack
npm run start:staging
```

**Files used:**
- `docker-compose.staging.yml` - Full stack (PostgreSQL, Kafka, Init, App)
- `Dockerfile` - Multi-stage app build

**Use when:**
- 📦 Deploying to staging
- 🌐 Deploying to production
- 🧪 Testing production build
- 🎭 Testing deployment process
- 🔒 Testing in isolated environment

**Benefits:**
- ✅ Production-like environment
- ✅ Exact same setup as production
- ✅ Isolated and containerized
- ✅ Resource limits enforced
- ✅ Auto-restart on failure
- ✅ Easy to deploy anywhere

## 📊 Comparison Table

| Aspect | Local Dev | Staging/Prod |
|--------|-----------|--------------|
| **App Location** | Runs locally | Runs in Docker |
| **Hot Reload** | ✅ Yes | ❌ No |
| **Rebuild Time** | None | 1-2 minutes |
| **Debugging** | Easy (IDE) | Logs only |
| **Resource Usage** | Lower | Higher |
| **Startup Time** | 30 sec | 2-3 min |
| **Use Case** | Development | Deployment |
| **Docker Compose File** | `docker-compose.yml` | `docker-compose.staging.yml` |

## 🔄 Workflow Examples

### Daily Development Workflow

```bash
# Morning: Start infrastructure (once)
npm run env:start

# Start coding
npm run dev

# Make changes → auto-reload! → test → repeat
# Your terminal shows live logs

# Evening: Stop infrastructure
npm run env:stop
```

### Testing Production Build

```bash
# Build and test production Docker image
npm run start:staging

# Test the API
curl http://localhost:3000/api/v1/currencies

# View logs
npm run logs:staging

# Stop when done
npm run stop:staging
```

### Deploying to Staging/Production

```bash
# Build production image
docker build -t billing-engine:v1.0 .

# Push to registry
docker push your-registry/billing-engine:v1.0

# Deploy using docker-compose.staging.yml
docker-compose -f docker-compose.staging.yml up -d
```

## 📋 Command Reference

### Local Development

| Command | Description |
|---------|-------------|
| `npm run env:start` | Start infrastructure (PostgreSQL, Kafka) |
| `npm run env:stop` | Stop infrastructure |
| `npm run env:clean` | Stop and remove data volumes |
| `npm run env:status` | Check infrastructure status |
| `npm run env:logs` | View infrastructure logs |
| `npm run env:ui` | Start with Kafka UI |
| `npm run dev` | Run app locally with hot reload |
| `npm run dev:debug` | Run app with debugger |
| `npm start` | Start infrastructure + app (combined) |

### Staging/Production

| Command | Description |
|---------|-------------|
| `npm run start:staging` | Start full stack (interactive) |
| `npm run start:staging:detached` | Start full stack (background) |
| `npm run stop:staging` | Stop staging environment |
| `npm run logs:staging` | View application logs |

## 🏗️ Architecture Comparison

### Local Development Architecture

```
┌─────────────────────────────────────────────────┐
│              Docker Compose                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │PostgreSQL│  │  Kafka   │  │   Init   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────┘
                      │
                      │ localhost connections
                      │
        ┌─────────────▼─────────────┐
        │    Your App (Local)       │
        │  • Hot Reload Enabled     │
        │  • IDE Debugging          │
        │  • Fast Iteration         │
        └───────────────────────────┘
```

### Staging/Production Architecture

```
┌─────────────────────────────────────────────────┐
│              Docker Compose                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │PostgreSQL│  │  Kafka   │  │   Init   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                      │                           │
│                      │ internal network          │
│                      │                           │
│              ┌───────▼────────┐                 │
│              │   App (Docker) │                 │
│              │  • Production  │                 │
│              │  • Auto-restart│                 │
│              │  • Isolated    │                 │
│              └────────────────┘                 │
└─────────────────────────────────────────────────┘
```

## 🔍 File Structure

```
billing-engine/
├── docker-compose.yml          # Local dev (infrastructure only)
├── docker-compose.staging.yml  # Staging/prod (full stack)
├── Dockerfile                  # App container build
├── .dockerignore              # Build optimization
│
├── package.json               # npm scripts for both modes
│
└── scripts/
    └── init-services.sh       # Automatic initialization
```

## 💡 Tips & Best Practices

### Local Development

**Keep infrastructure running between sessions:**
```bash
# Start once in the morning
npm run env:start

# Work all day with npm run dev
# Stop/start your app as needed

# Stop infrastructure at end of day
npm run env:stop
```

**Use Kafka UI when debugging events:**
```bash
npm run env:ui
# Visit http://localhost:8080
```

**Clean slate when needed:**
```bash
npm run env:clean  # Removes all data
npm run env:start  # Fresh start
```

### Staging/Production

**Always test locally first:**
```bash
# Test your changes locally
npm run dev

# Then test production build
npm run start:staging
```

**Check logs before deployment:**
```bash
npm run logs:staging
```

**Use resource limits in production:**
Edit `docker-compose.staging.yml` to adjust:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

## 🐛 Troubleshooting

### Local Development Issues

**App can't connect to PostgreSQL:**
```bash
# Verify infrastructure is running
npm run env:status

# Check if PostgreSQL is accessible
docker exec billing_db pg_isready -U postgres
```

**Hot reload not working:**
- Check if `npm run dev` is running
- Verify `nest-cli.json` has watch enabled
- Try restarting: Ctrl+C then `npm run dev`

**Kafka connection issues:**
```bash
# Check Kafka is healthy
docker exec billing_kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### Staging/Production Issues

**Container won't start:**
```bash
# Check logs
npm run logs:staging

# Rebuild from scratch
npm run stop:staging
docker-compose -f docker-compose.staging.yml build --no-cache
npm run start:staging
```

**Need to debug production image:**
```bash
# Enter the container
docker exec -it billing_app /bin/sh

# Check environment
env | grep DB_
env | grep KAFKA_
```

## 🎓 When to Use Which Mode

### Use Local Development When:
- ✅ Writing new features
- ✅ Fixing bugs
- ✅ Running unit tests
- ✅ Need fast feedback loop
- ✅ Using IDE debugger
- ✅ Experimenting with code

### Use Staging/Production When:
- ✅ Testing deployment process
- ✅ Validating production build
- ✅ Testing resource limits
- ✅ Preparing for release
- ✅ Demonstrating to stakeholders
- ✅ Running performance tests

## 📚 Additional Resources

- [SCRIPTLESS_STARTUP.md](./SCRIPTLESS_STARTUP.md) - Complete startup guide
- [QUICK_START.md](./QUICK_START.md) - Quick reference
- [README.md](./README.md) - Main documentation
- [Dockerfile](./Dockerfile) - App container configuration
- [docker-compose.yml](./docker-compose.yml) - Local dev setup
- [docker-compose.staging.yml](./docker-compose.staging.yml) - Production setup

---

## 🎯 Quick Decision Tree

```
Need hot reload for development?
├─ YES → Use Local Development Mode
│         npm run env:start && npm run dev
│
└─ NO  → Need production environment?
          ├─ YES → Use Staging/Production Mode
          │         npm run start:staging
          │
          └─ NO  → You probably want Local Dev Mode
                    (hot reload is almost always better for dev)
```

---

**🚀 Choose the right mode for your task and enjoy hassle-free development!**

