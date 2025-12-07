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
import { CompleteWithdrawalHandler } from './handlers/complete-withdrawal.handler';
import { CompleteTransferHandler } from './handlers/complete-transfer.handler';
import { FailTransactionHandler } from './handlers/fail-transaction.handler';
import { CompensateTransactionHandler } from './handlers/compensate-transaction.handler';

// CQRS Components - Events (Saga)
import { TopupRequestedHandler } from './handlers/topup-requested.handler';
import { WithdrawalRequestedHandler } from './handlers/withdrawal-requested.handler';
import { TransferRequestedHandler } from './handlers/transfer-requested.handler';

// CQRS Components - Events (Projections)
import { TopupRequestedProjectionHandler } from './handlers/projection/topup-requested-projection.handler';
import { TopupCompletedProjectionHandler } from './handlers/projection/topup-completed-projection.handler';
import { WithdrawalRequestedProjectionHandler } from './handlers/projection/withdrawal-requested-projection.handler';
import { WithdrawalCompletedProjectionHandler } from './handlers/projection/withdrawal-completed-projection.handler';
import { TransferRequestedProjectionHandler } from './handlers/projection/transfer-requested-projection.handler';
import { TransferCompletedProjectionHandler } from './handlers/projection/transfer-completed-projection.handler';
import { TransactionFailedProjectionHandler } from './handlers/projection/transaction-failed-projection.handler';
import { TransactionCompensatedProjectionHandler } from './handlers/projection/transaction-compensated-projection.handler';

// CQRS Components - Queries
import { GetTransactionHandler } from './queries/handlers/get-transaction.handler';
import { GetTransactionsByAccountHandler } from './queries/handlers/get-transactions-by-account.handler';

// Projections (Read Model)
import { TransactionProjection } from './projections/transaction-projection.entity';
import { TransactionProjectionService } from './projections/transaction-projection.service';

const CommandHandlers = [
  TopupHandler,
  WithdrawalHandler,
  TransferHandler,
  CompleteTopupHandler,
  CompleteWithdrawalHandler,
  CompleteTransferHandler,
  FailTransactionHandler,
  CompensateTransactionHandler,
];

const EventHandlers = [
  // Saga coordinators
  TopupRequestedHandler,
  WithdrawalRequestedHandler,
  TransferRequestedHandler,
  // Projection updaters
  TopupRequestedProjectionHandler,
  TopupCompletedProjectionHandler,
  WithdrawalRequestedProjectionHandler,
  WithdrawalCompletedProjectionHandler,
  TransferRequestedProjectionHandler,
  TransferCompletedProjectionHandler,
  TransactionFailedProjectionHandler,
  TransactionCompensatedProjectionHandler,
];

const QueryHandlers = [
  GetTransactionHandler,
  GetTransactionsByAccountHandler,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionProjection]),
    CqrsModule,
    AccountModule,
    CurrencyModule,
    AuditModule,
    PipelineModule, // Pipeline-based transaction processing
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    TransactionProjectionService,
    ...CommandHandlers,
    ...EventHandlers,
    ...QueryHandlers,
  ],
  exports: [TransactionService, TransactionProjectionService],
})
export class TransactionModule {}

