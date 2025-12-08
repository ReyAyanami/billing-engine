import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule, EventBus } from '@nestjs/cqrs';
import { getDatabaseConfig } from '../src/config/database.config';
import { InMemoryEventStore } from './helpers/in-memory-event-store';

// Import modules WITHOUT KafkaModule
import { AccountModule } from '../src/modules/account/account.module';
import { TransactionModule } from '../src/modules/transaction/transaction.module';
import { CurrencyModule } from '../src/modules/currency/currency.module';
import { AuditModule } from '../src/modules/audit/audit.module';

/**
 * Test-specific App Module that excludes KafkaModule.
 *
 * ⚠️ WARNING: This is a TEST-ONLY module!
 * - Uses InMemoryEventStore (events NOT persisted)
 * - Excludes KafkaModule (no event streaming)
 * - Simplified configuration for testing
 *
 * NEVER use this in production! Use AppModule instead.
 *
 * This module is used for E2E tests to avoid Kafka initialization overhead
 * and connection warnings. Tests use InMemoryEventStore by default.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    CqrsModule.forRoot(),
    // Business modules
    AccountModule,
    TransactionModule,
    CurrencyModule,
    AuditModule,
    // NOTE: KafkaModule is intentionally excluded for tests
  ],
  providers: [
    {
      provide: 'EVENT_STORE',
      useFactory: (eventBus: EventBus) => new InMemoryEventStore(eventBus),
      inject: [EventBus],
    },
    InMemoryEventStore,
  ],
  exports: ['EVENT_STORE', InMemoryEventStore],
})
export class AppTestModule implements OnModuleInit {
  private readonly logger = new Logger(AppTestModule.name);

  /**
   * Validates test environment on module initialization
   */
  onModuleInit() {
    this.validateTestEnvironment();
  }

  /**
   * GUARDRAIL: Ensure this module is only used in test environment
   * @throws Error if used in production
   */
  private validateTestEnvironment(): void {
    const nodeEnv = process.env.NODE_ENV;
    const isTest =
      nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined;

    if (!isTest) {
      const error = `
╔════════════════════════════════════════════════════════════════╗
║  ⛔ CRITICAL ERROR: AppTestModule in Production                ║
╠════════════════════════════════════════════════════════════════╣
║  AppTestModule is a TEST-ONLY module!                          ║
║                                                                 ║
║  Issues:                                                        ║
║  - Uses InMemoryEventStore (events NOT persisted)              ║
║  - Missing KafkaModule (no event streaming)                    ║
║  - No production monitoring or error handling                  ║
║  - No distributed system support                               ║
║                                                                 ║
║  ✅ Solution:                                                   ║
║  Import AppModule instead:                                     ║
║  import { AppModule } from './app.module';                     ║
║                                                                 ║
║  Current NODE_ENV: ${nodeEnv || 'undefined'}                   ║
╚════════════════════════════════════════════════════════════════╝
      `;

      this.logger.error(error);
      throw new Error('AppTestModule cannot be used outside test environment');
    }

    this.logger.warn('⚠️  AppTestModule loaded - TEST MODE ONLY');
    this.logger.warn(
      '⚠️  Using InMemoryEventStore - events are NOT persisted!',
    );
  }
}
