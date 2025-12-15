import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { getDatabaseConfig } from './config/database.config';
import { AccountModule } from './modules/account/account.module';
import { TransactionModule } from './modules/transaction/transaction.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AuditModule } from './modules/audit/audit.module';
import { KafkaModule } from './cqrs/kafka/kafka.module';
import { CqrsSagaModule } from './cqrs/cqrs-saga.module';
import { EventsModule } from './modules/events/events.module';
import { AdminModule } from './modules/admin/admin.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true, // Use environment variables only
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    CqrsModule.forRoot(), // CQRS support for commands, queries, and events
    KafkaModule, // Kafka event store for event sourcing
    CqrsSagaModule, // Saga orchestration and outbox pattern
    AccountModule,
    TransactionModule,
    CurrencyModule,
    AuditModule,
    EventsModule, // SSE events for real-time updates
    AdminModule, // Admin endpoints for fault tolerance operations
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
