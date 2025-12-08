# Logging Analysis & Recommendations

**Analysis Date:** December 8, 2025  
**Scope:** All logging in `src/` and `test/` directories

---

## Executive Summary

**Total Logs Found:**
- **src/**: 325 logger statements + 6 console statements
- **test/**: 11 logger statements + 18 console statements

**Key Issues:**
1. ⚠️ **Excessive verbosity in SAGA handlers** - generates 10-15 log lines per transaction
2. ⚠️ **Console.* usage instead of proper Logger** in production code
3. ⚠️ **Inconsistent log levels** - overuse of `.log()` instead of appropriate levels
4. ⚠️ **Missing correlation context** in some error logs
5. ⚠️ **Emoji usage** - while visually appealing, may cause issues in log aggregation systems

---

## Detailed Findings

### 1. SAGA Event Handlers (CRITICAL - High Verbosity)

**Files Affected:** 8 SAGA handlers, ~180 log statements

#### Current State:
```typescript
// transfer-requested.handler.ts - Example of excessive logging
this.logger.log(`📨 SAGA: Handling TransferRequestedEvent: ${event.aggregateId}`);
this.logger.log(`   Source Account: ${event.sourceAccountId}`);
this.logger.log(`   Destination Account: ${event.destinationAccountId}`);
this.logger.log(`   Amount: ${event.amount} ${event.currency}`);
this.logger.log(`   ⚙️  Step 1: Debiting source account...`);
this.logger.log(`   ✅ Source account debited: ${sourceNewBalance}`);
this.logger.log(`   ⚙️  Step 2: Crediting destination account...`);
this.logger.log(`   ✅ Destination account credited: ${destinationNewBalance}`);
this.logger.log(`   ⚙️  Step 3: Completing transaction...`);
this.logger.log(`   ✅ Transaction completed: ${event.aggregateId}`);
this.logger.log(`✅ SAGA: Transfer completed successfully!`);
```

**Impact:** A single successful transfer generates **11 log lines**. At 1000 TPS, this creates 11,000 log entries per second!

#### Recommendation: REDUCE to Critical Points Only

**Approach 1: Minimal (Recommended for Production)**
```typescript
this.logger.log(
  `SAGA: Transfer initiated [txId=${event.aggregateId}, source=${event.sourceAccountId}, ` +
  `dest=${event.destinationAccountId}, amount=${event.amount} ${event.currency}, ` +
  `correlationId=${event.correlationId}]`
);

try {
  // ... business logic ...
  
  this.logger.log(
    `SAGA: Transfer completed [txId=${event.aggregateId}, ` +
    `sourceBalance=${sourceNewBalance}, destBalance=${destinationNewBalance}]`
  );
} catch (error) {
  this.logger.error(
    `SAGA: Transfer failed [txId=${event.aggregateId}, ` +
    `correlationId=${event.correlationId}, error=${error.message}]`,
    error.stack
  );
}
```

**Result:** 2-3 log lines per transaction (80-85% reduction)

**Approach 2: Configurable Detail Level**
```typescript
private readonly isDebugMode = process.env.LOG_LEVEL === 'debug';

async handle(event: TransferRequestedEvent): Promise<void> {
  this.logger.log(
    `SAGA: Transfer initiated [txId=${event.aggregateId}, ` +
    `source=${event.sourceAccountId}, dest=${event.destinationAccountId}]`
  );
  
  try {
    if (this.isDebugMode) {
      this.logger.debug(`Step 1: Debiting source account ${event.sourceAccountId}`);
    }
    
    const sourceNewBalance = await this.commandBus.execute(debitCommand);
    
    if (this.isDebugMode) {
      this.logger.debug(`Step 2: Crediting destination ${event.destinationAccountId}`);
    }
    
    // ... rest of logic ...
    
    this.logger.log(`SAGA: Transfer completed [txId=${event.aggregateId}]`);
  } catch (error) {
    this.logger.error(
      `SAGA: Transfer failed [txId=${event.aggregateId}]`,
      error.stack
    );
  }
}
```

**Files to Update:**
- `src/modules/transaction/handlers/transfer-requested.handler.ts` (21 logs → 3-5)
- `src/modules/transaction/handlers/refund-requested.handler.ts` (23 logs → 3-5)
- `src/modules/transaction/handlers/payment-requested.handler.ts` (~20 logs → 3-5)
- `src/modules/transaction/handlers/topup-requested.handler.ts` (13 logs → 3-5)
- `src/modules/transaction/handlers/withdrawal-requested.handler.ts` (13 logs → 3-5)

---

### 2. Console.* Usage in Production Code (HIGH PRIORITY)

**Problem:** Direct console usage bypasses logging infrastructure, preventing:
- Log level filtering
- Structured logging
- Log aggregation
- Contextual information

#### Files Using console.*:

**`src/modules/account/account.service.ts:70`**
```typescript
// ❌ BAD
console.error('CQRS command failed (non-fatal):', error);

// ✅ GOOD
this.logger.warn(
  `CQRS command failed (non-fatal) [accountId=${savedAccount.id}, ` +
  `ownerId=${savedAccount.ownerId}]`,
  error.stack
);
```

**`src/cqrs/base/aggregate-root.ts:39,69`**
```typescript
// ❌ BAD
console.warn(
  `No handler found for event ${eventType} on aggregate ${this.getAggregateType()}`
);
console.error('Unable to determine event type from event:', event);

// ✅ GOOD - Add logger
private static readonly logger = new Logger(AggregateRoot.name);

AggregateRoot.logger.warn(
  `No handler found [eventType=${eventType}, aggregateType=${this.getAggregateType()}, ` +
  `aggregateId=${this.aggregateId}]`
);
AggregateRoot.logger.error(
  `Unable to determine event type [aggregateId=${this.aggregateId}]`,
  JSON.stringify(event)
);
```

**`src/common/filters/http-exception.filter.ts:45`**
```typescript
// ❌ BAD
console.error('Unexpected error:', exception);

// ✅ GOOD
import { Logger } from '@nestjs/common';
private readonly logger = new Logger(AllExceptionsFilter.name);

this.logger.error(
  `Unexpected error [path=${request.url}, method=${request.method}]`,
  exception instanceof Error ? exception.stack : JSON.stringify(exception)
);
```

**`src/main.ts:49-50`** (Acceptable but could be improved)
```typescript
// Current (acceptable for startup)
console.log(`Billing Engine API running on port ${port}`);
console.log(`Swagger documentation available at http://localhost:${port}/api/docs`);

// Better (with logger)
const logger = new Logger('Bootstrap');
logger.log(`Billing Engine API running on port ${port}`);
logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
```

---

### 3. Projection Handlers (MEDIUM PRIORITY)

**Current State:** Too verbose for read-model updates

#### Example - `refund-requested-projection.handler.ts`
```typescript
// Current: 7 log statements
this.logger.log(`📊 [Projection] RefundRequested: ${event.aggregateId}`);
this.logger.log(`   Original Payment: ${event.originalPaymentId}`);
this.logger.log(`   Merchant: ${event.merchantAccountId}`);
this.logger.log(`   Customer: ${event.customerAccountId}`);
this.logger.log(`   Amount: ${event.refundAmount} ${event.currency}`);
// ... in try block ...
this.logger.log(`✅ [Projection] Refund projection created: ${event.aggregateId}`);
// ... in catch ...
this.logger.error(`❌ [Projection] Failed to create refund projection`, error);
```

#### Recommendation: Minimal Logging

```typescript
async handle(event: RefundRequestedEvent): Promise<void> {
  // Only log on DEBUG level or errors
  if (process.env.LOG_LEVEL === 'debug') {
    this.logger.debug(
      `[Projection] RefundRequested [txId=${event.aggregateId}, ` +
      `paymentId=${event.originalPaymentId}]`
    );
  }
  
  try {
    await this.projectionService.createTransactionProjection({...});
    // No log on success - projections are background tasks
  } catch (error) {
    this.logger.error(
      `[Projection] Failed to create refund projection [txId=${event.aggregateId}]`,
      error.stack
    );
    // Consider re-throwing if projection failures should fail the saga
  }
}
```

**Files Affected:** 10 projection handlers (40+ logs → 0-10 logs)

---

### 4. Command Handlers (LOW-MEDIUM PRIORITY)

#### Current State: Acceptable but can be optimized

**Example - `refund.handler.ts`**
```typescript
// Current: 4 logs
this.logger.log(`[RefundHandler] Executing RefundCommand: ${command.refundId}`);
this.logger.log(`   Original Payment: ${command.originalPaymentId}`);
this.logger.log(`   Refund Amount: ${command.refundAmount} ${command.currency}`);
// ... later ...
this.logger.log(`✅ [RefundHandler] Refund requested: ${command.refundId}`);
```

#### Recommendation: Consolidate to 2 logs
```typescript
this.logger.log(
  `[RefundHandler] Executing [refundId=${command.refundId}, ` +
  `paymentId=${command.originalPaymentId}, amount=${command.refundAmount} ${command.currency}]`
);

// ... business logic ...

this.logger.log(`[RefundHandler] Completed [refundId=${command.refundId}]`);
```

---

### 5. Entity Handlers (LOW PRIORITY)

**Current State:** Mostly acceptable

```typescript
// These are fine - keep as-is for CQRS write-model tracking
this.logger.log(`📝 Creating Transaction entity: ${event.aggregateId}`);
this.logger.log(`✅ Transaction entity created: ${event.aggregateId}`);
this.logger.error(`❌ Failed to create Transaction entity`, error);
```

**Optional:** Remove emojis if log aggregation systems (Elasticsearch, Splunk) have issues.

---

### 6. Query Handlers (LOW PRIORITY)

**Current State:** Good, already minimal

```typescript
// Keep as-is
this.logger.log(`Fetching transaction: ${query.transactionId}`);
```

---

### 7. Test Files (INFORMATIONAL)

**test/e2e/setup/test-setup.ts:** Uses `console.log` for test setup info
- **Status:** Acceptable for tests, but consider using a test logger for consistency

**test/helpers/in-memory-event-store.ts:** Uses logger appropriately
- **Status:** Good

---

## Recommended Log Levels

| Level | Use Case | Examples |
|-------|----------|----------|
| **error** | Business logic failures, unexpected errors | SAGA compensation failures, database errors, invalid state |
| **warn** | Recoverable issues, deprecated usage | CQRS command failed (non-fatal), missing event handlers |
| **log** (info) | Important business events | Transaction started, completed, account created |
| **debug** | Detailed flow for troubleshooting | Step-by-step SAGA execution, event details |
| **verbose** | Very detailed internals | Event store operations, aggregate reconstruction |

---

## Implementation Priority

### Phase 1: CRITICAL (Do First) ⚡
1. **Replace all console.* with Logger** (4 files)
   - Impact: Enables proper log filtering and aggregation
   - Effort: 30 minutes

2. **Reduce SAGA handler verbosity** (8 files)
   - Impact: Reduces log volume by 80%
   - Effort: 2-3 hours

### Phase 2: HIGH (Do Soon) 📊
3. **Simplify projection handlers** (10 files)
   - Impact: Reduces background noise in logs
   - Effort: 1-2 hours

4. **Add correlation IDs to all error logs** (all handlers)
   - Impact: Improves traceability
   - Effort: 1 hour

### Phase 3: MEDIUM (Nice to Have) ✨
5. **Consolidate command handler logs** (15 files)
   - Impact: Cleaner log output
   - Effort: 2 hours

6. **Implement DEBUG_MODE flag** (configuration)
   - Impact: Allows detailed logging when needed
   - Effort: 1 hour

### Phase 4: LOW (Optional) 🎨
7. **Remove emojis** (if causing issues)
   - Impact: Better compatibility with log systems
   - Effort: 30 minutes

8. **Standardize test logging** (test files)
   - Impact: Consistency
   - Effort: 1 hour

---

## Configuration Recommendations

### Environment Variables
```bash
# .env
LOG_LEVEL=info          # production: info, development: debug
LOG_FORMAT=json         # json for production, pretty for dev
LOG_CORRELATION=true    # always include correlation IDs
```

### NestJS Logger Configuration
```typescript
// main.ts or app.module.ts
const logLevel = process.env.LOG_LEVEL || 'info';
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', ...(logLevel === 'debug' ? ['debug', 'verbose'] : [])],
});
```

---

## Example: Before vs After

### BEFORE (Transfer Handler)
```typescript
async handle(event: TransferRequestedEvent): Promise<void> {
  this.logger.log(`📨 SAGA: Handling TransferRequestedEvent: ${event.aggregateId}`);
  this.logger.log(`   Source Account: ${event.sourceAccountId}`);
  this.logger.log(`   Destination Account: ${event.destinationAccountId}`);
  this.logger.log(`   Amount: ${event.amount} ${event.currency}`);
  
  try {
    this.logger.log(`   ⚙️  Step 1: Debiting source account...`);
    const sourceNewBalance = await this.commandBus.execute(debitCommand);
    this.logger.log(`   ✅ Source account debited: ${sourceNewBalance}`);
    
    this.logger.log(`   ⚙️  Step 2: Crediting destination account...`);
    const destinationNewBalance = await this.commandBus.execute(creditCommand);
    this.logger.log(`   ✅ Destination account credited: ${destinationNewBalance}`);
    
    this.logger.log(`   ⚙️  Step 3: Completing transaction...`);
    await this.commandBus.execute(completeCommand);
    this.logger.log(`   ✅ Transaction completed: ${event.aggregateId}`);
    
    this.logger.log(`✅ SAGA: Transfer completed successfully!`);
  } catch (error) {
    this.logger.error(`   ❌ SAGA: Transfer failed: ${error.message}`);
    // ... compensation logic with more logs ...
  }
}
```
**Log count: 11 lines for success, 15+ for failure**

---

### AFTER (Optimized)
```typescript
async handle(event: TransferRequestedEvent): Promise<void> {
  this.logger.log(
    `SAGA: Transfer [txId=${event.aggregateId}, src=${event.sourceAccountId}, ` +
    `dst=${event.destinationAccountId}, amt=${event.amount} ${event.currency}, ` +
    `corr=${event.correlationId}]`
  );
  
  let sourceNewBalance: string | undefined;
  
  try {
    sourceNewBalance = await this.commandBus.execute(debitCommand);
    const destinationNewBalance = await this.commandBus.execute(creditCommand);
    await this.commandBus.execute(completeCommand);
    
    this.logger.log(
      `SAGA: Transfer completed [txId=${event.aggregateId}, ` +
      `srcBal=${sourceNewBalance}, dstBal=${destinationNewBalance}]`
    );
  } catch (error) {
    this.logger.error(
      `SAGA: Transfer failed [txId=${event.aggregateId}, corr=${event.correlationId}, ` +
      `step=${sourceNewBalance ? 'credit_dest' : 'debit_src'}]`,
      error.stack
    );
    
    if (sourceNewBalance) {
      try {
        await this.commandBus.execute(compensateUpdateCommand);
        await this.commandBus.execute(compensateCommand);
        this.logger.warn(
          `SAGA: Transfer compensated [txId=${event.aggregateId}]`
        );
      } catch (compensationError) {
        this.logger.error(
          `SAGA: COMPENSATION FAILED - MANUAL INTERVENTION REQUIRED ` +
          `[txId=${event.aggregateId}, corr=${event.correlationId}]`,
          compensationError.stack
        );
      }
    } else {
      await this.commandBus.execute(failCommand);
    }
  }
}
```
**Log count: 2 lines for success, 3-4 for failure (80% reduction)**

---

## Success Metrics

### Current State (Before)
- **Logs per successful transaction:** 25-30 lines
- **Logs per failed transaction:** 35-45 lines
- **At 100 TPS:** 2,500-3,000 log lines/second
- **Daily log volume (100 TPS):** ~260M lines, ~130GB uncompressed

### Target State (After)
- **Logs per successful transaction:** 4-6 lines
- **Logs per failed transaction:** 6-10 lines
- **At 100 TPS:** 400-600 log lines/second (80% reduction)
- **Daily log volume (100 TPS):** ~52M lines, ~26GB uncompressed (80% reduction)

**Cost Savings:** If using managed logging (e.g., CloudWatch, Datadog):
- At $0.50/GB: **$52/day → $13/day** = **$1,170/month savings**

---

## Conclusion

Your current logging is **thorough and well-structured** but **too verbose for production**. The emoji-based step tracking is great for development but creates unnecessary noise at scale.

### Key Actions:
1. ✅ Replace console.* (30 min)
2. ✅ Reduce SAGA handlers to 2-4 logs per transaction (2-3 hours)
3. ✅ Make projection handlers silent on success (1 hour)
4. ✅ Ensure all errors include correlation IDs (1 hour)

**Total effort: ~5-6 hours for 80% log reduction**

This will give you a **production-ready logging setup** that balances maintainability, troubleshooting capability, and operational efficiency.

