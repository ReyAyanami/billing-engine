import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';

// CQRS Components - Commands
import { CreateAccountHandler } from './handlers/create-account.handler';
import { UpdateBalanceHandler } from './handlers/update-balance.handler';
import { UpdateAccountStatusHandler } from './handlers/update-account-status.handler';
import { ReserveBalanceHandler } from './handlers/reserve-balance.handler';

// CQRS Components - Events (Projection handlers only)
import { AccountCreatedHandler } from './handlers/account-created.handler';
import { BalanceChangedHandler } from './handlers/balance-changed.handler';
import { AccountStatusChangedHandler } from './handlers/account-status-changed.handler';
import { AccountLimitsChangedHandler } from './handlers/account-limits-changed.handler';
import { ReplenishmentPolicy } from './handlers/replenishment.policy';

// CQRS Components - Queries
import { GetAccountHandler } from './queries/handlers/get-account.handler';
import { GetAccountsByOwnerHandler } from './queries/handlers/get-accounts-by-owner.handler';

// Projections (Read Model)
import { AccountProjection } from './projections/account-projection.entity';
import { AccountProjectionService } from './projections/account-projection.service';

// Fault Tolerance Services
import { AccountProjectionRebuildService } from './services/account-projection-rebuild.service';
import { AccountReconciliationService } from './services/account-reconciliation.service';

const CommandHandlers = [
  CreateAccountHandler,
  UpdateBalanceHandler,
  UpdateAccountStatusHandler,
  ReserveBalanceHandler,
];
const EventHandlers = [
  AccountCreatedHandler, // Updates projection only
  BalanceChangedHandler, // Updates projection only
  AccountStatusChangedHandler,
  AccountLimitsChangedHandler,
  ReplenishmentPolicy,
];
const QueryHandlers = [GetAccountHandler, GetAccountsByOwnerHandler];

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountProjection]), // Projection only - pure event sourcing
    CqrsModule,
    CurrencyModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [AccountController],
  providers: [
    AccountService,
    AccountProjectionService,
    AccountProjectionRebuildService,
    AccountReconciliationService,
    ...CommandHandlers,
    ...EventHandlers,
    ...QueryHandlers,
  ],
  exports: [
    AccountService,
    AccountProjectionService,
    AccountProjectionRebuildService,
    AccountReconciliationService,
  ],
})
export class AccountModule {}
