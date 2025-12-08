# Migration Guide: From Scripts to Scriptless Startup

This guide helps you transition from the old script-based startup to the new fully automated scriptless approach.

## 🎯 What Changed?

### Before (Script-Based)
```bash
# Multiple steps to remember:
./scripts/start.sh                    # Start infrastructure
./scripts/setup/create-topics.sh      # Create Kafka topics
npm run migration:run                 # Run migrations
npm run start:dev                     # Start app

# Easy to forget a step!
```

### After (Scriptless)
```bash
# One command does everything:
npm start

# That's it! 🎉
```

## 📋 Command Mapping

| Old Command | New Command | Notes |
|------------|-------------|-------|
| `./scripts/start.sh` | `npm start` | Now includes app startup too |
| `./scripts/stop.sh` | `npm stop` | Stops everything |
| `./scripts/setup/create-topics.sh` | _(automatic)_ | Runs automatically during startup |
| `npm run migration:run` | _(automatic)_ | Runs automatically during startup |
| `npm run start:dev` | `npm run dev` | For local development only |
| `./scripts/dev/status.sh` | `npm run status` | Check service status |
| `./scripts/dev/logs.sh` | `npm run logs` | View logs |

## 🔧 New npm Scripts

### Primary Commands
- **`npm start`** - Start entire stack (interactive)
- **`npm run start:detached`** - Start in background
- **`npm run start:debug-ui`** - Start with Kafka UI
- **`npm stop`** - Stop all services
- **`npm run stop:clean`** - Stop and remove volumes

### Monitoring Commands
- **`npm run logs`** - Follow app logs
- **`npm run logs:all`** - Follow all service logs
- **`npm run status`** - Check service status
- **`npm run restart`** - Restart application

### Development Commands
- **`npm run dev`** - Local dev with hot reload (no Docker)
- **`npm run dev:debug`** - Local dev with debugging
- **`npm run prod`** - Production mode

## 🚀 Migration Steps

### Step 1: Stop Old Services

If you have services running from the old scripts:

```bash
# Stop old services
./scripts/stop.sh

# Or manually
docker-compose down -v
```

### Step 2: Update Your Workflow

**Old workflow:**
```bash
# Morning routine - start work
./scripts/start.sh
./scripts/setup/create-topics.sh
npm run migration:run
npm run start:dev

# End of day
./scripts/stop.sh
```

**New workflow:**
```bash
# Morning routine - start work
npm start

# End of day
npm stop
```

### Step 3: Start Using Scriptless Approach

```bash
# Start everything
npm start

# Wait for initialization (first time: ~2-3 min, subsequent: ~30 sec)
# You'll see progress messages

# Verify it's running
curl http://localhost:3000/api/v1/currencies
```

## 📁 What's New?

### New Files Added
- `Dockerfile` - App containerization
- `scripts/init-services.sh` - Automatic initialization
- `.dockerignore` - Docker build optimization
- `SCRIPTLESS_STARTUP.md` - Full documentation
- `SCRIPTLESS_MIGRATION_GUIDE.md` - This file

### Modified Files
- `docker-compose.yml` - Added app and init services
- `package.json` - New npm scripts
- `README.md` - Updated quick start
- `QUICK_START.md` - Scriptless approach first

### Unchanged Files
- All scripts in `scripts/` directory still work
- You can still use them if preferred
- Tests work exactly as before

## 🔄 Rollback to Scripts (If Needed)

If you need to go back to the script-based approach:

```bash
# Stop scriptless version
npm stop

# Use old scripts
./scripts/start.sh
./scripts/setup/create-topics.sh
npm run migration:run
npm run dev
```

Everything still works as before!

## 💡 Development Workflows

### Workflow 1: Full Docker (Recommended)
```bash
npm run start:detached   # Start in background
# Make code changes
docker-compose up --build -d app  # Rebuild just the app
npm run logs             # Watch logs
```

### Workflow 2: Hybrid (Infrastructure in Docker, App Local)
```bash
docker-compose up postgres kafka -d   # Just infrastructure
npm run migration:run    # Manual migrations if needed
npm run dev              # Local development with hot reload
```

### Workflow 3: Full Local (Advanced)
```bash
# Set up local PostgreSQL and Kafka
# Create .env file with local connection details
npm run dev
```

## 🧪 Testing

Testing workflows remain unchanged:

```bash
npm test                 # Unit tests
npm run test:e2e         # E2E tests
npm run test:cov         # Coverage
```

## 🐛 Troubleshooting

### "Init container keeps restarting"

Check init logs:
```bash
docker-compose logs init
```

Common issues:
- Kafka not ready yet (wait longer)
- Docker socket permission issues (check Docker Desktop settings)

### "Port already in use"

Stop everything and clean:
```bash
npm run stop:clean
npm start
```

### "Migration errors"

First startup might show migration warnings if database already exists. This is normal.

For clean slate:
```bash
npm run stop:clean   # Removes volumes
npm start            # Fresh start
```

### "Want to see what's happening"

Use interactive mode and watch logs:
```bash
npm start            # Interactive - see all logs
# Or
npm run start:detached
npm run logs:all     # Watch logs
```

## 📊 Comparison Table

| Aspect | Script-Based | Scriptless |
|--------|-------------|------------|
| Startup Steps | 4-5 manual steps | 1 command |
| Onboarding Time | ~15 minutes | ~5 minutes |
| Forget a Step? | Common issue | Impossible |
| Works on Windows? | PowerShell needed | Yes |
| Production Ready? | Manual deployment | Same Docker images |
| Rollback Ability | N/A | Full script support remains |

## 🎓 Benefits of Scriptless Approach

### For Developers
✅ No need to remember commands  
✅ Consistent startup every time  
✅ Faster onboarding  
✅ Less cognitive load  
✅ Better documentation  

### For Teams
✅ Consistent environments  
✅ Easier code reviews  
✅ Simplified CI/CD  
✅ Reduced support requests  
✅ Better developer experience  

### For Production
✅ Same images as development  
✅ Infrastructure as code  
✅ Easier scaling  
✅ Better reliability  
✅ Simpler deployments  

## 📚 Additional Resources

- [Scriptless Startup Guide](./SCRIPTLESS_STARTUP.md) - Full documentation
- [Quick Start Guide](./QUICK_START.md) - Updated with scriptless approach
- [README](./README.md) - Main project documentation
- [Docker Compose Docs](https://docs.docker.com/compose/) - Learn more about Docker Compose

## 🤝 Feedback

If you encounter any issues or have suggestions:
1. Check the [Troubleshooting section](#-troubleshooting)
2. Review [SCRIPTLESS_STARTUP.md](./SCRIPTLESS_STARTUP.md)
3. Open an issue with details

## 🎉 Happy Coding!

Enjoy your new scriptless development experience!

---

**Last Updated**: December 2025

