import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { getDatabaseConfig } from '../src/config/database.config';

// Import modules WITHOUT KafkaModule
import { AccountModule } from '../src/modules/account/account.module';
import { TransactionModule } from '../src/modules/transaction/transaction.module';
import { CurrencyModule } from '../src/modules/currency/currency.module';
import { AuditModule } from '../src/modules/audit/audit.module';

/**
 * Test-specific App Module that excludes KafkaModule.
 * 
 * This module is used for E2E tests to avoid Kafka initialization overhead
 * and connection warnings. Tests use InMemoryEventStore instead.
 * 
 * Only kafka-integration.e2e-spec.ts should use the real AppModule with KafkaModule.
 */
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
    // Tests will override EVENT_STORE with InMemoryEventStore
  ],
})
export class AppTestModule {}

