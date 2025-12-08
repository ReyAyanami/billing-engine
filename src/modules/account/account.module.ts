import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Account } from './account.entity';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';

// CQRS Components - Commands
import { CreateAccountHandler } from './handlers/create-account.handler';
import { UpdateBalanceHandler } from './handlers/update-balance.handler';

// CQRS Components - Events
import { AccountCreatedHandler } from './handlers/account-created.handler';
import { AccountCreatedEntityHandler } from './handlers/account-created-entity.handler';
import { BalanceChangedHandler } from './handlers/balance-changed.handler';
import { BalanceChangedEntityHandler } from './handlers/balance-changed-entity.handler';
import { AccountStatusChangedHandler } from './handlers/account-status-changed.handler';
import { AccountLimitsChangedHandler } from './handlers/account-limits-changed.handler';

// CQRS Components - Queries
import { GetAccountHandler } from './queries/handlers/get-account.handler';
import { GetAccountsByOwnerHandler } from './queries/handlers/get-accounts-by-owner.handler';

// Projections (Read Model)
import { AccountProjection } from './projections/account-projection.entity';
import { AccountProjectionService } from './projections/account-projection.service';

const CommandHandlers = [CreateAccountHandler, UpdateBalanceHandler];
const EventHandlers = [
  AccountCreatedHandler,
  AccountCreatedEntityHandler,
  BalanceChangedHandler,
  BalanceChangedEntityHandler,
  AccountStatusChangedHandler,
  AccountLimitsChangedHandler,
];
const QueryHandlers = [GetAccountHandler, GetAccountsByOwnerHandler];

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, AccountProjection]),
    CqrsModule,
    CurrencyModule,
    AuditModule,
  ],
  controllers: [AccountController],
  providers: [
    AccountService,
    AccountProjectionService,
    ...CommandHandlers,
    ...EventHandlers,
    ...QueryHandlers,
  ],
  exports: [AccountService, AccountProjectionService],
})
export class AccountModule {}

