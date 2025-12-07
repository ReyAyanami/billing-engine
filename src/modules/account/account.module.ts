import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Account } from './account.entity';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';

// CQRS Components
import { CreateAccountHandler } from './handlers/create-account.handler';
import { AccountCreatedHandler } from './handlers/account-created.handler';

const CommandHandlers = [CreateAccountHandler];
const EventHandlers = [AccountCreatedHandler];

@Module({
  imports: [
    TypeOrmModule.forFeature([Account]),
    CqrsModule,
    CurrencyModule,
    AuditModule,
  ],
  controllers: [AccountController],
  providers: [
    AccountService,
    ...CommandHandlers,
    ...EventHandlers,
  ],
  exports: [AccountService],
})
export class AccountModule {}

