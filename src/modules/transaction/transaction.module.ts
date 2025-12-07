import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Transaction } from './transaction.entity';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { AccountModule } from '../account/account.module';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';
import { PipelineModule } from './pipeline/pipeline.module';

// CQRS Components - Commands
import { TopupHandler } from './handlers/topup.handler';
import { WithdrawalHandler } from './handlers/withdrawal.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { CompleteTopupHandler } from './handlers/complete-topup.handler';
import { FailTransactionHandler } from './handlers/fail-transaction.handler';

// CQRS Components - Events
import { TopupRequestedHandler } from './handlers/topup-requested.handler';

const CommandHandlers = [
  TopupHandler,
  WithdrawalHandler,
  TransferHandler,
  CompleteTopupHandler,
  FailTransactionHandler,
];

const EventHandlers = [
  TopupRequestedHandler,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    CqrsModule,
    AccountModule,
    CurrencyModule,
    AuditModule,
    PipelineModule, // Pipeline-based transaction processing
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    ...CommandHandlers,
    ...EventHandlers,
  ],
  exports: [TransactionService],
})
export class TransactionModule {}

