import { Module, Global } from '@nestjs/common';
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
 * This module is used for E2E tests to avoid Kafka initialization overhead
 * and connection warnings. Tests use InMemoryEventStore by default.
 * 
 * Only kafka-integration.e2e-spec.ts should use the real AppModule with KafkaModule.
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
export class AppTestModule {}

