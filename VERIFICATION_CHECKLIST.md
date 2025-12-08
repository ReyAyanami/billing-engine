# ✅ Scriptless Startup Verification Checklist

Use this checklist to verify that the scriptless startup is working correctly.

## 🎯 Pre-Flight Checks

Before testing, ensure:
- [ ] Docker Desktop is installed and running
- [ ] No other services are using ports 3000, 5432, 9092, or 8080
- [ ] You have at least 2GB of free RAM
- [ ] You have at least 5GB of free disk space

Check Docker:
```bash
docker info
```

## 🚀 Test 1: Clean First Start

### Stop and clean any existing services:
```bash
npm run stop:clean
```

### Start the system:
```bash
npm start
```

### Expected Output:
- [ ] PostgreSQL container starts and reports healthy
- [ ] Kafka container starts and reports healthy  
- [ ] Init container starts after both are healthy
- [ ] Init creates 4 Kafka topics successfully
- [ ] Init runs migrations successfully
- [ ] Init exits with success
- [ ] App container starts
- [ ] App reports "Billing Engine API running on port 3000"
- [ ] No error messages appear

### Verify in another terminal:
```bash
# Check status
npm run status

# Expected: All services show "Up (healthy)" or "Exited (0)"
```

**Status**: [ ] PASS / [ ] FAIL

---

## 🧪 Test 2: API Functionality

### Test currency endpoint:
```bash
curl http://localhost:3000/api/v1/currencies
```

**Expected**: JSON array of currencies (USD, EUR, GBP, BTC, ETH, POINTS)

### Test Swagger docs:
```bash
curl http://localhost:3000/api/docs
```

**Expected**: HTML page with Swagger UI

### Create a test account:
```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "test_user",
    "ownerType": "user",
    "currency": "USD"
  }'
```

**Expected**: JSON with account details and ID

**Status**: [ ] PASS / [ ] FAIL

---

## 🔄 Test 3: Idempotency (Restart)

### Stop the system:
```bash
npm stop
```

**Expected**: All containers stop gracefully

### Start again:
```bash
npm start
```

**Expected**:
- [ ] Starts faster (30-60 seconds)
- [ ] No errors about existing topics
- [ ] No errors about applied migrations
- [ ] App starts successfully
- [ ] Previous data is preserved

### Verify data persistence:
```bash
curl http://localhost:3000/api/v1/accounts?ownerId=test_user
```

**Expected**: Account created in Test 2 still exists

**Status**: [ ] PASS / [ ] FAIL

---

## 📊 Test 4: Service Logs

### View application logs:
```bash
npm run logs
```

**Expected**:
- [ ] Clean log output
- [ ] No error messages
- [ ] Shows "Billing Engine API running"
- [ ] Can press Ctrl+C to exit

### View all logs:
```bash
npm run logs:all
```

**Expected**:
- [ ] Shows logs from all services
- [ ] PostgreSQL shows database initialized
- [ ] Kafka shows broker started
- [ ] Init shows setup completed
- [ ] App shows API running

**Status**: [ ] PASS / [ ] FAIL

---

## 🛠️ Test 5: Background Mode

### Stop current instance:
```bash
npm stop
```

### Start in detached mode:
```bash
npm run start:detached
```

**Expected**:
- [ ] Services start in background
- [ ] Terminal returns immediately
- [ ] No logs shown in terminal

### Verify services running:
```bash
npm run status
```

**Expected**: All services show "Up"

### Check logs:
```bash
npm run logs
```

**Expected**: Can view and follow logs

### Stop background services:
```bash
npm stop
```

**Status**: [ ] PASS / [ ] FAIL

---

## 🐛 Test 6: Debug Mode

### Start with Kafka UI:
```bash
npm run start:debug-ui
```

**Expected**:
- [ ] All services start
- [ ] Kafka UI container starts
- [ ] Kafka UI accessible at http://localhost:8080

### Access Kafka UI:
Open browser to http://localhost:8080

**Expected**:
- [ ] UI loads successfully
- [ ] Shows "local" cluster
- [ ] Shows 4 billing topics
- [ ] Topics show partition counts

### Stop debug mode:
```bash
npm stop
```

**Status**: [ ] PASS / [ ] FAIL

---

## 🧹 Test 7: Clean Slate

### Full cleanup:
```bash
npm run stop:clean
```

**Expected**:
- [ ] All containers stop
- [ ] All volumes removed
- [ ] Data cleaned up

### Verify cleanup:
```bash
docker ps -a | grep billing
docker volume ls | grep billing
```

**Expected**: No results (all cleaned)

### Start fresh:
```bash
npm start
```

**Expected**:
- [ ] Creates new volumes
- [ ] Initializes fresh database
- [ ] Creates fresh Kafka topics
- [ ] Starts successfully

### Verify fresh state:
```bash
curl http://localhost:3000/api/v1/accounts?ownerId=test_user
```

**Expected**: Empty array (previous test account gone)

**Status**: [ ] PASS / [ ] FAIL

---

## ⚙️ Test 8: Error Recovery

### Simulate failure - Stop Kafka:
```bash
docker stop billing_kafka
```

**Expected**:
- [ ] App logs show Kafka connection errors
- [ ] Container may restart automatically

### Restart Kafka:
```bash
docker start billing_kafka
```

**Expected**:
- [ ] Kafka recovers
- [ ] App reconnects
- [ ] System operational again

### Verify recovery:
```bash
curl http://localhost:3000/api/v1/currencies
```

**Expected**: API responds successfully

**Status**: [ ] PASS / [ ] FAIL

---

## 🎓 Test 9: Development Workflow

### Hybrid mode - Infrastructure only:
```bash
npm stop
docker-compose up postgres kafka -d
```

**Expected**:
- [ ] Only PostgreSQL and Kafka start
- [ ] App doesn't start

### Run app locally:
```bash
npm run dev
```

**Expected**:
- [ ] App starts with hot reload
- [ ] Connects to Docker services
- [ ] API accessible at port 3000

### Make a code change:
Edit `src/main.ts`, change the log message

**Expected**:
- [ ] App reloads automatically
- [ ] New message appears in logs

### Stop local dev:
Press Ctrl+C

### Stop infrastructure:
```bash
docker-compose down
```

**Status**: [ ] PASS / [ ] FAIL

---

## 📈 Test 10: Performance

### Measure first start:
```bash
npm run stop:clean
time npm start
```

**Expected time**: 1-3 minutes (depends on machine)

### Measure subsequent start:
```bash
npm stop
time npm start
```

**Expected time**: 30-60 seconds

### Check resource usage:
```bash
docker stats --no-stream
```

**Expected**:
- [ ] PostgreSQL: ~50-100MB RAM
- [ ] Kafka: ~300-500MB RAM
- [ ] App: ~150-250MB RAM
- [ ] Total: <1GB RAM

**Status**: [ ] PASS / [ ] FAIL

---

## 📋 Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Clean First Start | [ ] | |
| 2. API Functionality | [ ] | |
| 3. Idempotency | [ ] | |
| 4. Service Logs | [ ] | |
| 5. Background Mode | [ ] | |
| 6. Debug Mode | [ ] | |
| 7. Clean Slate | [ ] | |
| 8. Error Recovery | [ ] | |
| 9. Development Workflow | [ ] | |
| 10. Performance | [ ] | |

**Overall Result**: [ ] ALL PASS / [ ] SOME FAILURES

---

## 🐛 Troubleshooting Failed Tests

### Test 1 Fails (First Start)
**Check**:
```bash
docker-compose logs init
docker-compose logs postgres
docker-compose logs kafka
```

**Common issues**:
- Docker not running: `docker info`
- Port conflicts: `lsof -i :3000 -i :5432 -i :9092`
- Insufficient resources: Check Docker Desktop settings

### Test 2 Fails (API)
**Check**:
```bash
docker-compose logs app
curl -v http://localhost:3000/api/v1/currencies
```

**Common issues**:
- App not started: `npm run status`
- Database connection: Check app logs
- Port conflicts: `lsof -i :3000`

### Test 3 Fails (Restart)
**Check**:
```bash
docker volume ls | grep billing
```

**Common issues**:
- Volumes deleted accidentally: Use `npm stop` not `npm run stop:clean`
- Database schema changed: Check migration logs

### Tests 4-10 Fail
Refer to [SCRIPTLESS_STARTUP.md](./SCRIPTLESS_STARTUP.md) troubleshooting section.

---

## ✅ Certification

After all tests pass:

```
I hereby certify that the Scriptless Startup system is:
✅ Fully functional
✅ Reliable across restarts
✅ Performant and resource-efficient
✅ Well-documented and easy to use

Date: _______________
Tested by: _______________
```

---

## 📚 Next Steps

After verification:
1. Read [SCRIPTLESS_STARTUP.md](./SCRIPTLESS_STARTUP.md)
2. Review [STARTUP_ARCHITECTURE.md](./STARTUP_ARCHITECTURE.md)
3. Check [SCRIPTLESS_MIGRATION_GUIDE.md](./SCRIPTLESS_MIGRATION_GUIDE.md)
4. Start building features!

**🎉 Happy Coding!**

