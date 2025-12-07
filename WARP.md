# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands & Development Workflow

### Installation & Local Environment
- Install dependencies:
  - `npm install`
- Start local PostgreSQL (for dev and E2E tests):
  - `docker-compose up -d`
- Environment configuration (used by `src/config/database.config.ts`):
  - Create `.env` with at least:
    - `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SSL`
    - `PORT` (defaults to `3000` if unset)
    - `NODE_ENV` (`development` enables TypeORM `synchronize` and SQL logging; `production` disables schema sync).

### Running the Application
- Development server with hot reload:
  - `npm run start:dev`
- Standard (non-watch) start:
  - `npm run start`
- Build and run in production mode:
  - `npm run build`
  - `npm run start:prod`

The HTTP API listens on `PORT` (default `3000`). On bootstrap (`src/main.ts`) the app:
- Sets up a global `ValidationPipe` (transform + whitelist + forbidNonWhitelisted).
- Enables CORS.
- Calls `CurrencyService.initializeDefaultCurrencies()` to seed currencies in the database.

### Linting & Formatting
- Lint the codebase (TypeScript-aware ESLint):
  - `npm run lint`
- Format source and tests with Prettier:
  - `npm run format`

ESLint is configured via `eslint.config.mjs` using `typescript-eslint` with type-aware rules (`projectService: true`) and `eslint-plugin-prettier/recommended`.

### Testing
- Unit tests (Jest, `.spec.ts` under `src/`):
  - `npm run test`
- Watch mode for unit tests:
  - `npm run test:watch`
- Coverage report:
  - `npm run test:cov`
- E2E tests (Jest + Supertest, specs in `test/`, config in `test/jest-e2e.json`):
  - Requires PostgreSQL and env vars configured as for dev.
  - `npm run test:e2e`

#### Running a Single Test
- Single unit test file (using Jest CLI through npm script), e.g. account service spec:
  - `npm test -- src/modules/account/account.service.spec.ts`
- Single E2E spec, e.g. the full billing flow:
  - `npm run test:e2e -- billing-engine.e2e-spec.ts`

Jest unit tests are configured inline in `package.json` (rootDir `src`, `.*\.spec\.ts$`). E2E tests use `test/jest-e2e.json` (`.*e2e-spec.ts$`).

## High-Level Architecture & Code Structure

### Overall Shape
- **Framework / stack**: NestJS 11, TypeScript 5, TypeORM, PostgreSQL.
- The system is a modular NestJS application exposing:
  - HTTP REST APIs (controllers under `src/modules/**` and routes documented in `README.md` and `ARCHITECTURE.md`).
  - Programmatic APIs via injectable services (e.g. `AccountService`, `TransactionService`).
- Root wiring lives in:
  - `src/main.ts` – bootstraps Nest, global pipes, CORS, and currency seeding.
  - `src/app.module.ts` – registers configuration, database, and feature modules.

Key reference docs in the repo:
- `README.md` – overview, features, quickstart, API examples.
- `ARCHITECTURE.md` – logical architecture, flows, API surface.
- `DATA_MODEL.md` – entities, relationships, and constraints.
- `REQUIREMENTS.md` – functional and non‑functional requirements.

### NestJS Modules & Layers

#### Root & Infrastructure
- **AppModule** (`src/app.module.ts`):
  - Imports:
    - `ConfigModule.forRoot({ isGlobal: true })` – environment-based configuration.
    - `TypeOrmModule.forRoot(getDatabaseConfig())` – Postgres connection via `src/config/database.config.ts`.
    - Domain modules: `AccountModule`, `TransactionModule`, `CurrencyModule`, `AuditModule`.
  - Registers `AppController` / `AppService` for the root `GET /` health check / hello.
  - Adds a global exception filter via `APP_FILTER` bound to `AllExceptionsFilter`.

- **Database configuration** (`src/config/database.config.ts`):
  - Builds a `TypeOrmModuleOptions` from env vars.
  - Uses `entities: [__dirname + '/../**/*.entity{.ts,.js}']` so all `*.entity.ts` files are auto-registered.
  - `synchronize` is enabled when `NODE_ENV !== 'production'` to simplify local development.

#### Domain Modules
Each domain module follows a consistent pattern: `*.module.ts` wires together TypeORM entities, services, and HTTP controllers.

- **AccountModule** (`src/modules/account`):
  - Entity: `Account` (`account.entity.ts`) – represents an account with `ownerId`/`ownerType`, currency, balance, status (`ACTIVE`, `SUSPENDED`, `CLOSED`), JSON metadata, optimistic `version`, and timestamp columns.
  - Service: `AccountService` (`account.service.ts`):
    - Creates accounts (validates currency via `CurrencyService`).
    - Fetches by ID or owner, including `currencyDetails` relation.
    - Manages status transitions (validates allowed transitions and logs via `AuditService`).
    - Provides `getBalance` projections.
    - Exposes low-level primitives used by transactions:
      - `findAndLock(id, manager)` – acquires a pessimistic write lock on an account row.
      - `validateAccountActive(account)` – ensures an account can transact.
      - `updateBalance(account, newBalance, manager)` – persists balance inside an active transaction.
  - Controller: `AccountController` (`account.controller.ts`):
    - Routes under `api/v1/accounts` (create, fetch by ID, fetch by owner, balance, status updates).
    - Uses DTOs for validation and constructs an `OperationContext` (correlation ID, actor metadata) per request.

- **TransactionModule** (`src/modules/transaction`):
  - Entity: `Transaction` (`transaction.entity.ts`):
    - Captures all financial operations with `TransactionType` and `TransactionStatus` enums.
    - Stores `idempotencyKey`, `amount`, `currency`, `balanceBefore/After`, references, JSON metadata, optional `counterpartyAccountId`, and optional `parentTransactionId` for refunds.
    - Indexed heavily on account, status, timestamps, idempotency key, and parent transaction for performance.
  - Service: `TransactionService` (`transaction.service.ts`): central transaction coordinator.
    - **Patterns**:
      - Wraps operations in `dataSource.transaction(...)` to guarantee atomicity.
      - Uses `AccountService.findAndLock` with pessimistic locks to avoid race conditions.
      - Enforces idempotency via `checkIdempotency` on `idempotencyKey` (throws `DuplicateTransactionException` on duplicates).
      - Uses `Decimal` for precise money arithmetic.
      - Logs each operation via `AuditService.log` with structured `changes` JSON and `OperationContext`.
    - Core methods:
      - `topup`, `withdraw` – single-account credit/debit flows, with currency validation and balance checks.
      - `transfer` – two-account flow:
        - Locks both accounts in deterministic ID order to avoid deadlocks.
        - Creates paired debit and credit transactions, each with its own idempotency key.
        - Updates both balances and marks both transactions `COMPLETED` in one DB transaction.
      - `refund` – reversible logic for prior transactions:
        - Looks up original transaction, verifies it is refundable and `COMPLETED`.
        - Decides whether the refund is a credit or debit depending on the original type.
        - Updates account balance, creates a `REFUND` transaction linked via `parentTransactionId`, and marks original as `REFUNDED`.
      - `findById`, `findByAccount` – query helpers used by APIs.
  - Controller: `TransactionController` (`transaction.controller.ts`):
    - Routes under `api/v1/transactions` (topup, withdraw, transfer, refund, find by ID, list by account).
    - Applies a `ValidationPipe` at the controller level and builds `OperationContext` instances for each command endpoint.

- **CurrencyModule** (`src/modules/currency`):
  - Entity: `Currency` (`currency.entity.ts`):
    - Configuration for supported currencies (code, name, type `fiat`/`non-fiat`, precision, active flag, metadata).
  - Service: `CurrencyService` (`currency.service.ts`):
    - Validates currency codes (`validateCurrency`) and throws `InvalidCurrencyException` when unsupported or inactive.
    - Provides simple read APIs (`findAll`, `findByCode`).
    - Seeds defaults with `initializeDefaultCurrencies()` called on app bootstrap.
  - Controller: `CurrencyController` (`currency.controller.ts`):
    - Routes under `api/v1/currencies` for listing and fetching by code.

- **AuditModule** (`src/modules/audit`):
  - Entity: `AuditLog` (`audit-log.entity.ts`):
    - Immutable audit entries with `entityType`, `entityId`, `operation`, `actor` fields, `changes` payload, `correlationId`, and timestamp.
  - Service: `AuditService` (`audit.service.ts`):
    - `log(...)` creates audit entries for domain operations.
    - Query helpers (`findByEntity`, `findByCorrelationId`, `findByOperation`) support investigations and tracing.

### Cross-Cutting Concerns

- **Error Handling**:
  - Custom billing exceptions in `src/common/exceptions/billing.exception.ts` map domain errors to structured HTTP responses with a stable `error.code` (e.g., `ACCOUNT_NOT_FOUND`, `INSUFFICIENT_BALANCE`, `CURRENCY_MISMATCH`, `DUPLICATE_TRANSACTION`, `REFUND_ERROR`, etc.).
  - `AllExceptionsFilter` (`src/common/filters/http-exception.filter.ts`) is registered globally via `APP_FILTER` and:
    - Passes through `HttpException` payloads (including custom `BillingException` shapes).
    - Normalizes unexpected errors into a generic `INTERNAL_SERVER_ERROR` envelope and logs them in development.

- **Correlation IDs**:
  - `OperationContext` (`src/common/types/index.ts`) tracks `correlationId`, actor info, and timestamp.
  - Controllers build a new `OperationContext` for each domain command and pass it into services so `AuditService` can persist it.
  - A `CorrelationIdInterceptor` exists in `src/common/interceptors/correlation-id.interceptor.ts` to propagate `X-Correlation-ID` between request and response; it is not yet wired globally in `AppModule` but can be hooked up via `APP_INTERCEPTOR` if needed.

- **Validation & DTOs**:
  - DTOs under `src/modules/**/dto` use `class-validator` / `class-transformer` annotations.
  - Validation is enforced by global and controller-level `ValidationPipe` usage, ensuring request bodies are typed and sanitized before hitting services.

### Testing Topology

- **Unit tests** (`src/**/*.spec.ts`):
  - Configured via Jest settings in `package.json` (rootDir `src`).
  - Typical NestJS-style tests that use `@nestjs/testing` to create isolated modules.

- **E2E tests** (`test/*.e2e-spec.ts`):
  - Boot a full `AppModule` instance (see `test/billing-engine.e2e-spec.ts`).
  - Use Supertest to exercise the HTTP endpoints end-to-end against a real PostgreSQL database.
  - Cover end-to-end flows including account creation, topups, withdrawals, transfers, refunds, balance checks, and error codes (e.g., `INSUFFICIENT_BALANCE`, `CURRENCY_MISMATCH`, invalid currencies, non-existent accounts).

### Where to Look for Deeper Context

- For **business rules and requirements**: `REQUIREMENTS.md`.
- For **system and API architecture diagrams and flows**: `ARCHITECTURE.md`.
- For **detailed data model and SQL-level considerations**: `DATA_MODEL.md`.
- For **API usage examples and endpoint list**: `README.md` (sections: API Usage Examples, API Endpoints, Error Handling).
