import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { CqrsSagaModule } from '../../cqrs/cqrs-saga.module';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { AccountModule } from '../account/account.module';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';

// CQRS Components - Commands
import { TopupHandler } from './handlers/topup.handler';
import { WithdrawalHandler } from './handlers/withdrawal.handler';
import { TransferHandler } from './handlers/transfer.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { RefundHandler } from './handlers/refund.handler';
import { CompleteTopupHandler } from './handlers/complete-topup.handler';
import { CompleteWithdrawalHandler } from './handlers/complete-withdrawal.handler';
import { CompleteTransferHandler } from './handlers/complete-transfer.handler';
import { CompletePaymentHandler } from './handlers/complete-payment.handler';
import { CompleteRefundHandler } from './handlers/complete-refund.handler';
import { FailTransactionHandler } from './handlers/fail-transaction.handler';
import { CompensateTransactionHandler } from './handlers/compensate-transaction.handler';

// CQRS Components - Events (Saga)
import { TopupRequestedHandler } from './handlers/topup-requested.handler';
import { WithdrawalRequestedHandler } from './handlers/withdrawal-requested.handler';
import { TransferRequestedHandler } from './handlers/transfer-requested.handler';
import { PaymentRequestedHandler } from './handlers/payment-requested.handler';
import { RefundRequestedHandler } from './handlers/refund-requested.handler';

// CQRS Components - Events (Projections only - pure event sourcing)
import { TopupRequestedProjectionHandler } from './handlers/projection/topup-requested-projection.handler';
import { TopupCompletedProjectionHandler } from './handlers/projection/topup-completed-projection.handler';
import { WithdrawalRequestedProjectionHandler } from './handlers/projection/withdrawal-requested-projection.handler';
import { WithdrawalCompletedProjectionHandler } from './handlers/projection/withdrawal-completed-projection.handler';
import { TransferRequestedProjectionHandler } from './handlers/projection/transfer-requested-projection.handler';
import { TransferCompletedProjectionHandler } from './handlers/projection/transfer-completed-projection.handler';
import { PaymentRequestedProjectionHandler } from './handlers/projection/payment-requested-projection.handler';
import { PaymentCompletedProjectionHandler } from './handlers/projection/payment-completed-projection.handler';
import { RefundRequestedProjectionHandler } from './handlers/projection/refund-requested-projection.handler';
import { RefundCompletedProjectionHandler } from './handlers/projection/refund-completed-projection.handler';
import { TransactionFailedProjectionHandler } from './handlers/projection/transaction-failed-projection.handler';
import { TransactionCompensatedProjectionHandler } from './handlers/projection/transaction-compensated-projection.handler';

// CQRS Components - Queries
import { GetTransactionHandler } from './queries/handlers/get-transaction.handler';
import { GetTransactionsByAccountHandler } from './queries/handlers/get-transactions-by-account.handler';

// Projections (Read Model)
import { TransactionProjection } from './projections/transaction-projection.entity';
import { TransactionProjectionService } from './projections/transaction-projection.service';

// Fault Tolerance Services
import { TransactionProjectionRebuildService } from './services/transaction-projection-rebuild.service';
import { TransactionReconciliationService } from './services/transaction-reconciliation.service';

const CommandHandlers = [
  TopupHandler,
  WithdrawalHandler,
  TransferHandler,
  PaymentHandler,
  RefundHandler,
  CompleteTopupHandler,
  CompleteWithdrawalHandler,
  CompleteTransferHandler,
  CompletePaymentHandler,
  CompleteRefundHandler,
  FailTransactionHandler,
  CompensateTransactionHandler,
];

const EventHandlers = [
  // Saga coordinators
  TopupRequestedHandler,
  WithdrawalRequestedHandler,
  TransferRequestedHandler,
  PaymentRequestedHandler,
  RefundRequestedHandler,
  // Projection updaters only (pure event sourcing)
  TopupRequestedProjectionHandler,
  TopupCompletedProjectionHandler,
  WithdrawalRequestedProjectionHandler,
  WithdrawalCompletedProjectionHandler,
  TransferRequestedProjectionHandler,
  TransferCompletedProjectionHandler,
  PaymentRequestedProjectionHandler,
  PaymentCompletedProjectionHandler,
  RefundRequestedProjectionHandler,
  RefundCompletedProjectionHandler,
  TransactionFailedProjectionHandler,
  TransactionCompensatedProjectionHandler,
];

const QueryHandlers = [GetTransactionHandler, GetTransactionsByAccountHandler];

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionProjection]), // Projection only - pure event sourcing
    CqrsModule,
    CqrsSagaModule, // Import saga infrastructure
    AccountModule,
    CurrencyModule,
    AuditModule,
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    TransactionProjectionService,
    TransactionProjectionRebuildService,
    TransactionReconciliationService,
    ...CommandHandlers,
    ...EventHandlers,
    ...QueryHandlers,
  ],
  exports: [
    TransactionService,
    TransactionProjectionService,
    TransactionProjectionRebuildService,
    TransactionReconciliationService,
  ],
})
export class TransactionModule {}
