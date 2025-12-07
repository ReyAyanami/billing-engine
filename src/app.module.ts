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
    AccountModule,
    TransactionModule,
    CurrencyModule,
    AuditModule,
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
