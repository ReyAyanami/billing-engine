# TypeScript Strict Typing Recommendations

**Date:** December 8, 2025  
**Purpose:** Comprehensive analysis and recommendations to improve TypeScript type safety across the billing-engine codebase

---

## Executive Summary

This analysis identified **115+ instances of `any` type usage** across the codebase (99 in src/, 16 in tests) and several missing strict TypeScript compiler options. While the codebase is already using some strict checks (`strictNullChecks`, `noImplicitAny`), there are significant opportunities to improve type safety and reduce runtime bugs.

### Key Findings:
- ✅ **Good:** No `@ts-ignore` or `@ts-expect-error` comments found
- ✅ **Good:** Minimal use of non-null assertions (`!.`) - only 2 instances
- ⚠️ **Moderate:** 64 type assertions (`as`) across 40 files
- ❌ **Critical:** `@typescript-eslint/no-explicit-any` is **turned OFF** in ESLint
- ❌ **Critical:** Missing strict compiler options in tsconfig.json
- ❌ **Critical:** 99 instances of `any` type in production code

---

## 1. Configuration Changes

### 1.1 TypeScript Configuration (`tsconfig.json`)

**Current State:**
- Partial strict mode (individual flags enabled)
- Missing several important strict checks

**Recommendation: Enable Full Strict Mode**

Replace individual strict flags with the umbrella `strict` flag and add additional safety checks:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    
    // ===== STRICT MODE (RECOMMENDED) =====
    "strict": true,  // Enables all strict checks below:
    // - strictNullChecks (already enabled)
    // - noImplicitAny (already enabled)
    // - strictBindCallApply (already enabled)
    // - strictFunctionTypes (NEW)
    // - strictPropertyInitialization (NEW)
    // - noImplicitThis (NEW)
    // - alwaysStrict (NEW)
    // - useUnknownInCatchVariables (NEW)
    
    // ===== ADDITIONAL RECOMMENDED FLAGS =====
    "noFallthroughCasesInSwitch": true,  // Already enabled
    "noUncheckedIndexedAccess": true,    // NEW - Important for array/object access
    "noImplicitReturns": true,           // NEW - All code paths must return
    "noImplicitOverride": true,          // NEW - Require 'override' keyword
    "noUnusedLocals": true,              // NEW - Catch unused variables
    "noUnusedParameters": true,          // NEW - Catch unused parameters
    "noPropertyAccessFromIndexSignature": true,  // NEW - Stricter object access
    "exactOptionalPropertyTypes": true   // NEW - Stricter optional properties
  }
}
```

**Impact:** HIGH - Will initially cause compilation errors but will catch many potential bugs

**Migration Strategy:**
1. Add flags one at a time, starting with least disruptive
2. Fix errors in small batches
3. Focus on `src/` first, then `test/`

---

### 1.2 ESLint Configuration (`eslint.config.mjs`)

**Current State:**
- `@typescript-eslint/no-explicit-any` is **OFF** ❌
- Many type-safety rules are set to `warn` instead of `error`
- Missing explicit return type rules

**Recommendation: Stricter ESLint Rules**

```javascript
{
  rules: {
    // ===== TYPE SAFETY (ERRORS - NOT WARNINGS) =====
    '@typescript-eslint/no-explicit-any': 'error',  // Change from 'off' to 'error'
    '@typescript-eslint/no-unsafe-argument': 'error',  // Change from 'warn'
    '@typescript-eslint/no-unsafe-assignment': 'error',  // Change from 'warn'
    '@typescript-eslint/no-unsafe-member-access': 'error',  // Change from 'warn'
    '@typescript-eslint/no-unsafe-call': 'error',  // Change from 'warn'
    '@typescript-eslint/no-unsafe-return': 'error',  // Change from 'warn'
    
    // ===== EXPLICIT RETURN TYPES (NEW) =====
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
      allowConciseArrowFunctionExpressionsStartingWithVoid: true,
    }],
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    
    // ===== PROMISE & ASYNC SAFETY =====
    '@typescript-eslint/no-floating-promises': 'error',  // Change from 'warn'
    '@typescript-eslint/require-await': 'error',  // Change from 'warn'
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/promise-function-async': 'error',
    
    // ===== TYPE ASSERTIONS =====
    '@typescript-eslint/consistent-type-assertions': ['error', {
      assertionStyle: 'as',
      objectLiteralTypeAssertions: 'never',
    }],
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    
    // ===== NAMING CONVENTIONS =====
    '@typescript-eslint/naming-convention': ['error',
      // Interfaces should start with 'I' or use PascalCase
      {
        selector: 'interface',
        format: ['PascalCase'],
        custom: {
          regex: '^I[A-Z]',
          match: false,  // Don't require 'I' prefix (modern convention)
        },
      },
      // Type aliases should use PascalCase
      {
        selector: 'typeAlias',
        format: ['PascalCase'],
      },
      // Enums should use PascalCase
      {
        selector: 'enum',
        format: ['PascalCase'],
      },
      // Classes should use PascalCase
      {
        selector: 'class',
        format: ['PascalCase'],
      },
      // Variables should use camelCase
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allow',
      },
      // Functions should use camelCase
      {
        selector: 'function',
        format: ['camelCase'],
      },
      // Parameters should use camelCase
      {
        selector: 'parameter',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
      },
    ],
    
    // Keep existing rules
    '@typescript-eslint/no-redundant-type-constituents': 'error',
    '@typescript-eslint/restrict-template-expressions': 'error',
    '@typescript-eslint/prefer-promise-reject-errors': 'error',
    '@typescript-eslint/unbound-method': 'off',
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
  },
}
```

**Impact:** CRITICAL - Will fail lint checks on 115+ locations

**Migration Strategy:**
1. Change rules to `error` one at a time
2. Run `npm run lint:check` to identify all violations
3. Fix violations in batches by module
4. Consider adding temporary overrides for test files during migration

---

## 2. Code-Level Issues & Recommendations

### 2.1 `any` Type Usage (99 instances in src/, 16 in tests)

#### **Critical Locations:**

#### A. Event Sourcing Infrastructure

**File:** `src/cqrs/base/aggregate-root.ts`  
**Issues:** 5 instances of `any`, disabled eslint rules

```typescript
// CURRENT (Lines 31, 68, 90):
protected apply(event: DomainEvent | any, isNew: boolean = true): void
private getEventHandler(event: DomainEvent | any): Function | undefined
const handler = (this as any)[handlerName];
```

**Recommendation:**
```typescript
// Define a proper type for deserialized events
interface DeserializedEvent {
  eventType: string;
  aggregateVersion: number;
  [key: string]: unknown;  // Use 'unknown' instead of 'any'
}

// Update method signatures
protected apply(event: DomainEvent | DeserializedEvent, isNew: boolean = true): void
private getEventHandler(event: DomainEvent | DeserializedEvent): ((event: DeserializedEvent) => void) | undefined

// Replace dynamic access with type guard
const handler = this[handlerName as keyof this];
if (typeof handler === 'function') {
  return handler as (event: DeserializedEvent) => void;
}
```

---

**File:** `src/cqrs/kafka/kafka-event-store.ts`  
**Issues:** Non-null assertions, `any` in event deserialization

```typescript
// CURRENT (Line 188):
const eventData = JSON.parse(message.value!.toString());
```

**Recommendation:**
```typescript
// Create proper types for Kafka messages
interface KafkaEventMessage {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  timestamp: string;
  correlationId: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Safe parsing with validation
private parseEventMessage(value: Buffer | null): KafkaEventMessage {
  if (!value) {
    throw new Error('Kafka message value is null');
  }
  
  const parsed: unknown = JSON.parse(value.toString());
  
  // Validate the structure
  if (!this.isValidEventMessage(parsed)) {
    throw new Error('Invalid event message structure');
  }
  
  return parsed;
}

private isValidEventMessage(obj: unknown): obj is KafkaEventMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'eventType' in obj &&
    'aggregateId' in obj &&
    'aggregateVersion' in obj
  );
}
```

---

#### B. DTOs and Metadata

**Files:** Multiple DTOs (topup.dto.ts, payment.dto.ts, etc.)

```typescript
// CURRENT:
metadata?: Record<string, any>;
```

**Recommendation:**
```typescript
// Define specific metadata types per domain
interface TransactionMetadata {
  source?: string;
  bankReference?: string;
  externalId?: string;
  userAgent?: string;
  ipAddress?: string;
  // Add more known fields
  [key: string]: string | number | boolean | undefined;  // More specific than 'any'
}

// Or use a stricter approach with branded types
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

interface TopupDto {
  // ... other fields
  metadata?: JsonObject;
}
```

---

#### C. Exception Handling

**File:** `src/common/exceptions/billing.exception.ts`

```typescript
// CURRENT (Lines 8, 64, 114):
public readonly details?: any,
constructor(message: string, details?: any)
```

**Recommendation:**
```typescript
// Define proper exception details types
type ExceptionDetails = 
  | Record<string, string | number | boolean | Date>
  | { [key: string]: unknown };

export class BillingException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: ExceptionDetails,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        error: {
          code,
          message,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      httpStatus,
    );
  }
}

export class InvalidOperationException extends BillingException {
  constructor(message: string, details?: ExceptionDetails) {
    super('INVALID_OPERATION', message, details, HttpStatus.BAD_REQUEST);
  }
}

export class RefundException extends BillingException {
  constructor(message: string, details?: ExceptionDetails) {
    super('REFUND_ERROR', message, details, HttpStatus.BAD_REQUEST);
  }
}
```

---

#### D. HTTP Filters and Interceptors

**File:** `src/common/filters/http-exception.filter.ts`

```typescript
// CURRENT (Line 20):
let errorResponse: any = {
```

**Recommendation:**
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    path: string;
  };
}

catch(exception: unknown, host: ArgumentsHost): void {
  // ... setup code ...
  
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let errorResponse: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: request.url,
    },
  };
  
  // ... rest of implementation
}
```

---

**File:** `src/common/interceptors/correlation-id.interceptor.ts`

```typescript
// CURRENT (Line 22):
(request as any).correlationId = correlationId;
```

**Recommendation:**
```typescript
// Create proper type extensions
interface RequestWithCorrelation extends Request {
  correlationId: string;
}

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithCorrelation>();
    const response = context.switchToHttp().getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? uuidv4();

    request.correlationId = correlationId;
    response.setHeader('X-Correlation-ID', correlationId);

    return next.handle();
  }
}
```

---

#### E. Domain Events

**File:** `src/cqrs/base/domain-event.ts`

```typescript
// CURRENT (Line 30):
readonly metadata?: Record<string, any>;

// And (Lines 59, 78):
toJSON(): Record<string, any>
protected getEventData(): Record<string, any>
```

**Recommendation:**
```typescript
// Define a proper metadata type
type EventMetadata = Record<string, string | number | boolean | Date | null | undefined>;

// Define a proper JSON type
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

export abstract class DomainEvent {
  // ... other fields
  readonly metadata?: EventMetadata;

  constructor(props: {
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    correlationId: string;
    causationId?: string;
    metadata?: EventMetadata;
  }) {
    // ... implementation
  }

  toJSON(): JsonObject {
    return {
      eventId: this.eventId,
      eventType: this.getEventType(),
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      aggregateVersion: this.aggregateVersion,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      causationId: this.causationId,
      metadata: this.metadata,
      ...this.getEventData(),
    };
  }

  protected getEventData(): JsonObject {
    return {};
  }
}
```

---

#### F. Event Classes

**Files:** All event files (payment-requested.event.ts, etc.)

```typescript
// CURRENT:
metadata?: Record<string, any>;
paymentMetadata?: {
  orderId?: string;
  invoiceId?: string;
  description?: string;
  merchantReference?: string;
  [key: string]: any;  // ❌ Too permissive
}
```

**Recommendation:**
```typescript
// Define specific metadata types
interface PaymentMetadata {
  orderId?: string;
  invoiceId?: string;
  description?: string;
  merchantReference?: string;
  customData?: Record<string, string | number | boolean>;  // More specific
}

export class PaymentRequestedEvent extends DomainEvent {
  constructor(
    public readonly customerAccountId: string,
    public readonly merchantAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;  // Use defined type
    },
    public readonly paymentMetadata?: PaymentMetadata,  // Use specific type
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  getEventType(): string {
    return 'PaymentRequested';
  }

  protected getEventData(): JsonObject {
    return {
      customerAccountId: this.customerAccountId,
      merchantAccountId: this.merchantAccountId,
      amount: this.amount,
      currency: this.currency,
      idempotencyKey: this.idempotencyKey,
      paymentMetadata: this.paymentMetadata ?? {},
    };
  }
}
```

---

### 2.2 Type Assertions (64 instances across 40 files)

**Current Pattern:**
```typescript
// Type assertions without validation
const value = someObject as SomeType;
const result = data as ExpectedResult;
```

**Recommendation:**

Create type guard functions for runtime validation:

```typescript
// src/common/utils/type-guards.ts (NEW FILE)

/**
 * Type guard functions for runtime type checking.
 * Use these instead of direct type assertions.
 */

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

// Domain-specific type guards
export function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === 'string' &&
    ['active', 'inactive', 'suspended', 'closed'].includes(value)
  );
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'completed', 'failed', 'compensated'].includes(value)
  );
}

// Use in code:
// BEFORE:
const status = data.status as TransactionStatus;

// AFTER:
if (!isTransactionStatus(data.status)) {
  throw new Error(`Invalid transaction status: ${data.status}`);
}
const status = data.status;
```

---

### 2.3 Test Files (16 instances of `any` in 6 test files)

**Files:**
- `test/unit/account.service.spec.ts` (3 instances)
- `test/helpers/in-memory-event-store.ts` (1 instance)
- `test/e2e/helpers/test-api-http.ts` (8 instances)
- `test/e2e/setup/test-setup.ts` (2 instances)
- `test/helpers/event-polling.helper.ts` (1 instance)

**Recommendation:**

Test files can be slightly more lenient, but should still avoid `any` where possible:

```typescript
// test/e2e/helpers/test-api-http.ts

// CURRENT:
private server: any;
private externalAccounts: Record<string, any> = {};
async createAccount(params: CreateAccountParams = {}): Promise<any>

// RECOMMENDED:
import { Server } from 'http';

private server: Server;
private externalAccounts: Map<string, AccountResponse> = new Map();

interface AccountResponse {
  id: string;
  currency: string;
  balance: string;
  status: string;
  accountType: string;
  // ... other fields
}

async createAccount(params: CreateAccountParams = {}): Promise<AccountResponse> {
  // ... implementation with proper typing
}
```

**Strategy for test files:**
1. Define response types that match API responses
2. Use `unknown` for truly dynamic data, then validate
3. Consider creating a `test/types` folder for shared test types
4. It's acceptable to use `any` for mock objects if properly justified with comments

---

### 2.4 Missing Return Types

Many async functions lack explicit return types.

**Recommendation:**

Add explicit return types to all public methods:

```typescript
// BEFORE:
async topup(dto: TopupDto, context: OperationContext) {
  // ...
}

// AFTER:
async topup(
  dto: TopupDto,
  context: OperationContext,
): Promise<TransactionResult> {
  // ...
}
```

This will be enforced by the ESLint rule `@typescript-eslint/explicit-function-return-type`.

---

### 2.5 Index Signature Access

When `noUncheckedIndexedAccess` is enabled, all array/object access will return `T | undefined`.

**Current Pattern:**
```typescript
const item = array[0];  // Type: T
const value = obj[key];  // Type: V
```

**After enabling `noUncheckedIndexedAccess`:**
```typescript
const item = array[0];  // Type: T | undefined
const value = obj[key];  // Type: V | undefined
```

**Recommendation:**

Add proper null checks:

```typescript
// Option 1: Explicit check
const item = array[0];
if (!item) {
  throw new Error('Item not found');
}
// item is now definitely T

// Option 2: Nullish coalescing with default
const item = array[0] ?? defaultValue;

// Option 3: Optional chaining
const property = obj[key]?.someProperty;
```

---

## 3. Migration Strategy

### Phase 1: Configuration Updates (Week 1)

**Priority:** HIGH  
**Effort:** LOW  
**Impact:** Foundation for all other improvements

1. **Update ESLint rules** (DO NOT enable `error` yet):
   ```bash
   # Change rules to 'warn' first to see scope
   npm run lint:check > lint-violations.txt
   ```

2. **Add new TypeScript flags one at a time:**
   - Start with `noImplicitReturns` (easiest)
   - Then `noUnusedLocals` and `noUnusedParameters`
   - Then `noUncheckedIndexedAccess`
   - Finally enable full `strict: true`

3. **Create tracking document:**
   - List all violations by file/module
   - Assign priorities (critical path code first)

### Phase 2: Event Sourcing Infrastructure (Week 2)

**Priority:** CRITICAL  
**Effort:** MEDIUM  
**Files:** 
- `src/cqrs/base/aggregate-root.ts`
- `src/cqrs/base/domain-event.ts`
- `src/cqrs/kafka/kafka-event-store.ts`

**Why First:** These are base classes used throughout the system. Fixing them provides types for everything else.

**Steps:**
1. Define proper types for deserialized events
2. Add type guards for event validation
3. Update `AggregateRoot.apply()` and `getEventHandler()`
4. Update `KafkaEventStore` message parsing
5. Run tests to ensure no regressions

### Phase 3: Domain Events (Week 3)

**Priority:** HIGH  
**Effort:** MEDIUM  
**Files:** All files in `src/modules/*/events/`

**Steps:**
1. Define `EventMetadata` and `JsonObject` types
2. Create specific metadata types for each event category
3. Update all event classes to use specific types
4. Update event handlers to expect specific types

### Phase 4: DTOs and API Layer (Week 3-4)

**Priority:** HIGH  
**Effort:** LOW-MEDIUM  
**Files:** All files in `src/modules/*/dto/`

**Steps:**
1. Define specific metadata types per DTO
2. Replace `Record<string, any>` with specific types
3. Add validation in class-validator decorators
4. Update Swagger documentation

### Phase 5: Exception Handling (Week 4)

**Priority:** MEDIUM  
**Effort:** LOW  
**Files:**
- `src/common/exceptions/billing.exception.ts`
- `src/common/filters/http-exception.filter.ts`

**Steps:**
1. Define `ExceptionDetails` type
2. Update all exception classes
3. Update exception filter
4. Test error responses

### Phase 6: Interceptors and Middleware (Week 4)

**Priority:** LOW  
**Effort:** LOW  
**Files:**
- `src/common/interceptors/correlation-id.interceptor.ts`

**Steps:**
1. Define extended Request types
2. Update interceptors
3. Update any middleware

### Phase 7: Test Files (Week 5)

**Priority:** LOW  
**Effort:** MEDIUM  
**Files:** All files in `test/`

**Steps:**
1. Define test response types
2. Update test helpers (especially `test-api-http.ts`)
3. Update unit tests
4. Update e2e tests

### Phase 8: Enable Strict ESLint Rules (Week 6)

**Priority:** CRITICAL  
**Effort:** LOW  
**Impact:** Enforcement

**Steps:**
1. Verify all violations are fixed
2. Change ESLint rules from `warn` to `error`
3. Set up pre-commit hooks to enforce (already have husky)
4. Update CI/CD to fail on lint errors

---

## 4. Recommended New Files

### 4.1 Type Definitions

Create central type definition files for better organization:

```
src/
  common/
    types/
      index.ts                 # Existing
      json.types.ts            # NEW - JSON types
      metadata.types.ts        # NEW - Metadata types
      event.types.ts           # NEW - Event-related types
      validation.types.ts      # NEW - Validation types
    utils/
      type-guards.ts           # NEW - Runtime type guards
      type-assertions.ts       # NEW - Safe type assertions
```

**Example: `src/common/types/json.types.ts`**
```typescript
/**
 * Type-safe JSON representations
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Safely parse JSON with type checking
 */
export function parseJson(text: string): JsonValue {
  const parsed: unknown = JSON.parse(text);
  if (!isJsonValue(parsed)) {
    throw new Error('Invalid JSON structure');
  }
  return parsed;
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}
```

**Example: `src/common/types/metadata.types.ts`**
```typescript
/**
 * Metadata types for events, transactions, and other entities
 */

// Base metadata type - stricter than Record<string, any>
export type MetadataValue = string | number | boolean | Date | null | undefined;
export type Metadata = Record<string, MetadataValue>;

// Event-specific metadata
export interface EventMetadata extends Metadata {
  actorId?: string;
  actorType?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

// Transaction-specific metadata
export interface TransactionMetadata extends Metadata {
  source?: string;
  externalId?: string;
  bankReference?: string;
  processorId?: string;
  processorResponse?: string;
}

// Payment-specific metadata
export interface PaymentMetadata extends TransactionMetadata {
  orderId?: string;
  invoiceId?: string;
  description?: string;
  merchantReference?: string;
  customData?: Record<string, string | number>;
}

// Refund-specific metadata
export interface RefundMetadata extends TransactionMetadata {
  reason?: string;
  reasonCode?: string;
  refundType?: 'full' | 'partial';
  initiatedBy?: string;
}
```

---

## 5. Benefits of These Changes

### 5.1 Development Experience

1. **Better IDE Support:**
   - Accurate autocomplete
   - Better refactoring tools
   - Instant error detection

2. **Faster Development:**
   - Less time debugging runtime type errors
   - More confidence when refactoring
   - Clear contracts between modules

3. **Easier Onboarding:**
   - Self-documenting code
   - Clear type expectations
   - Less need for extensive documentation

### 5.2 Code Quality

1. **Fewer Bugs:**
   - Catch type errors at compile time
   - Prevent null/undefined access
   - Eliminate invalid state

2. **Better Testing:**
   - Easier to mock with proper types
   - Test cases are clearer
   - Less need for runtime type checks

3. **Maintainability:**
   - Refactoring is safer
   - Breaking changes are caught immediately
   - Easier to understand code intent

### 5.3 Performance

1. **Runtime Performance:**
   - Fewer runtime type checks needed
   - Less defensive programming
   - Better optimization by TypeScript compiler

2. **Build Performance:**
   - More effective tree-shaking
   - Better dead code elimination

---

## 6. Effort Estimation

| Phase | Effort | Files | Lines Changed | Priority |
|-------|--------|-------|---------------|----------|
| Phase 1: Config | 1 day | 2 | ~50 | Critical |
| Phase 2: Infrastructure | 3 days | 3 | ~200 | Critical |
| Phase 3: Events | 3 days | ~40 | ~400 | High |
| Phase 4: DTOs | 2 days | ~15 | ~150 | High |
| Phase 5: Exceptions | 1 day | 2 | ~50 | Medium |
| Phase 6: Interceptors | 1 day | ~5 | ~50 | Low |
| Phase 7: Tests | 3 days | ~12 | ~200 | Low |
| Phase 8: Enable Rules | 1 day | 1 | ~10 | Critical |
| **TOTAL** | **~15 days** | **~80** | **~1,110** | - |

**Note:** These estimates assume one developer working full-time. With multiple developers working in parallel on different modules, this could be completed in 2-3 weeks.

---

## 7. Quick Wins (Can Do Today)

These changes provide immediate value with minimal effort:

### 1. Enable `noImplicitReturns` (5 minutes)
```json
// tsconfig.json
"noImplicitReturns": true
```
Catch functions with missing return statements.

### 2. Add explicit return types to public methods (1-2 hours)
```typescript
// Pick 5-10 most important functions and add return types
async topup(dto: TopupDto, context: OperationContext): Promise<TransactionResult>
async getAccount(accountId: string): Promise<Account>
```

### 3. Replace `Record<string, any>` with `Record<string, unknown>` (30 minutes)
```bash
# Find and replace (review each one)
# any → unknown makes code safer without breaking anything
```

### 4. Create type guard utilities file (1 hour)
```typescript
// src/common/utils/type-guards.ts
// Add 5-10 most useful type guards
// Use them in 2-3 critical locations
```

### 5. Fix exception details types (30 minutes)
```typescript
// src/common/exceptions/billing.exception.ts
// Replace `details?: any` with proper type
type ExceptionDetails = Record<string, string | number | boolean | Date>;
```

---

## 8. Monitoring Progress

### Metrics to Track:

1. **`any` Count:**
   ```bash
   # Track over time
   grep -r "\bany\b" src/ | wc -l
   ```
   - Baseline: 99
   - Target: < 10 (only in truly dynamic cases)

2. **Type Assertions:**
   ```bash
   grep -r "\s\+as\s\+" src/ | wc -l
   ```
   - Baseline: 64
   - Target: < 20 (with type guards)

3. **Lint Violations:**
   ```bash
   npm run lint:check 2>&1 | grep "error" | wc -l
   ```
   - Track weekly

4. **Build Errors with Strict Mode:**
   ```bash
   npm run type-check 2>&1 | grep "error" | wc -l
   ```
   - Track as you enable each strict flag

### Weekly Check-In Template:

```markdown
## Week N - TypeScript Strict Mode Migration

### Metrics:
- `any` usage: X (-Y from last week)
- Type assertions: X (-Y from last week)
- Lint errors: X (-Y from last week)
- Build errors: X (-Y from last week)

### Completed:
- [ ] Phase completed
- [ ] Files migrated

### Next Week:
- [ ] Target phase
- [ ] Expected files
```

---

## 9. Risks & Mitigation

### Risk 1: Breaking Changes
**Impact:** HIGH  
**Likelihood:** MEDIUM

**Mitigation:**
- Migrate incrementally
- Comprehensive testing after each phase
- Keep feature branch separate until validated
- Run full e2e test suite after each module

### Risk 2: Development Slowdown
**Impact:** MEDIUM  
**Likelihood:** HIGH (initially)

**Mitigation:**
- Team training on strict TypeScript patterns
- Create internal examples/guides
- Pair programming during migration
- Accept that first week will be slower (investment pays off)

### Risk 3: Third-Party Library Types
**Impact:** LOW  
**Likelihood:** MEDIUM

**Mitigation:**
- Use `@types/*` packages where available
- Create local type declarations for untyped libraries
- Use `skipLibCheck: true` to ignore library issues

### Risk 4: False Positives from Linter
**Impact:** LOW  
**Likelihood:** MEDIUM

**Mitigation:**
- Allow selective rule disabling with comments (must have explanation)
- Document patterns that require exceptions
- Review exceptions in code review

---

## 10. References & Resources

### TypeScript Documentation:
- [Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
- [Compiler Options](https://www.typescriptlang.org/tsconfig)
- [Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

### ESLint TypeScript:
- [Plugin Documentation](https://typescript-eslint.io/)
- [Recommended Rules](https://typescript-eslint.io/linting/configs)

### Best Practices:
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Effective TypeScript](https://effectivetypescript.com/)
- [Type-Safe Error Handling](https://github.com/supermacro/neverthrow)

### Internal Documentation (Create These):
- [ ] TypeScript Style Guide
- [ ] Common Type Patterns
- [ ] Migration Examples
- [ ] Type Guard Utilities Documentation

---

## 11. Decision: Gradual vs. Big Bang

### Recommended: **Gradual Migration** ✅

**Rationale:**
1. System is in production/active development
2. 115+ instances to fix across 80+ files
3. Lower risk of introducing bugs
4. Team can learn incrementally
5. Can deliver value continuously

### Alternative: Big Bang (Not Recommended) ❌

**Only consider if:**
- Development is paused for a sprint
- Entire team can focus on this exclusively
- Have 2-3 weeks of dedicated time
- Can afford potential bugs in next release

---

## 12. Success Criteria

This migration will be considered successful when:

1. ✅ All strict TypeScript compiler flags enabled
2. ✅ All ESLint type-safety rules set to `error`
3. ✅ Zero `@typescript-eslint/no-explicit-any` violations (except documented exceptions)
4. ✅ `any` usage reduced to < 10 instances in `src/` (only truly dynamic cases)
5. ✅ All public APIs have explicit return types
6. ✅ All tests passing
7. ✅ No increase in runtime errors (monitor for 2 weeks post-deployment)
8. ✅ Developer satisfaction survey shows positive feedback

---

## 13. Conclusion

The billing-engine codebase has a solid foundation with some strict checks already enabled, but there are significant opportunities to improve type safety. The migration to full strict mode will:

- **Reduce bugs** by catching type errors at compile time
- **Improve developer experience** with better IDE support
- **Increase maintainability** with self-documenting code
- **Build confidence** for refactoring and feature development

The recommended gradual migration approach over 6 weeks balances risk and reward, allowing the team to learn incrementally while delivering continuous value.

**Next Steps:**
1. Review and approve this document
2. Start with Phase 1 (Configuration) this week
3. Assign owners for each phase
4. Set up weekly check-ins to track progress

---

**Document Owner:** [Your Name]  
**Last Updated:** December 8, 2025  
**Status:** Awaiting Approval

