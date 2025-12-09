import { IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { SagaHandler } from '../../../cqrs/decorators/saga-handler.decorator';
import { SagaCoordinator } from '../../../cqrs/saga/saga-coordinator.service';
import { RefundRequestedEvent } from '../events/refund-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteRefundCommand } from '../commands/complete-refund.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { CompensateTransactionCommand } from '../commands/compensate-transaction.command';

/**
 * Event handler for RefundRequestedEvent (Saga Coordinator).
 *
 * This implements the Transaction Saga pattern for refunds:
 * 1. Listen for RefundRequested
 * 2. Update MERCHANT account balance (DEBIT)
 * 3. Update CUSTOMER account balance (CREDIT)
 * 4. On success: Complete refund (via CompleteRefundCommand)
 * 5. On failure: Compensate + Fail refund
 *
 * Refund reverses a payment:
 * - Payment: Customer → Merchant (C2B)
 * - Refund: Merchant → Customer (B2C)
 */
@Injectable()
@SagaHandler(RefundRequestedEvent)
export class RefundRequestedHandler implements IEventHandler<RefundRequestedEvent> {
  private readonly logger = new Logger(RefundRequestedHandler.name);

  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: RefundRequestedEvent): Promise<void> {
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'refund',
      correlationId: event.correlationId,
      steps: ['debit_merchant', 'credit_customer', 'complete_transaction'],
      metadata: event.metadata,
    });

    this.logger.log(
      `SAGA: Refund initiated [txId=${event.aggregateId}, payment=${event.originalPaymentId}]`,
    );

    let merchantNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the merchant account
      const debitCommand = new UpdateBalanceCommand({
        accountId: event.merchantAccountId,
        changeAmount: event.refundAmount,
        changeType: 'DEBIT',
        reason: `Refund to customer ${event.customerAccountId} (refund: ${event.aggregateId}, payment: ${event.originalPaymentId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      merchantNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(debitCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'debit_merchant',
        result: { merchantNewBalance },
      });

      // Step 2: CREDIT the customer account
      const creditCommand = new UpdateBalanceCommand({
        accountId: event.customerAccountId,
        changeAmount: event.refundAmount,
        changeType: 'CREDIT',
        reason: `Refund from merchant ${event.merchantAccountId} (refund: ${event.aggregateId}, payment: ${event.originalPaymentId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const customerNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(creditCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'credit_customer',
        result: { customerNewBalance },
      });

      // Step 3: Complete the refund
      if (!merchantNewBalance) {
        throw new Error('Merchant balance update failed');
      }

      const completeCommand = new CompleteRefundCommand(
        event.aggregateId,
        merchantNewBalance,
        customerNewBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { merchantNewBalance, customerNewBalance },
      });

      this.logger.log(`SAGA: Refund completed [txId=${event.aggregateId}]`);
    } catch (error: unknown) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const failureStep = merchantNewBalance
        ? 'credit_customer'
        : 'debit_merchant';
      const errorCode = (error as { code?: string })?.code;

      this.logger.error(
        `SAGA: Refund failed [txId=${event.aggregateId}, step=${failureStep}]`,
        errorObj.stack,
      );

      // Check if we need compensation (merchant was debited)
      if (merchantNewBalance) {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: true,
        });

        try {
          // COMPENSATION: Credit back the merchant account
          const compensateUpdateCommand = new UpdateBalanceCommand({
            accountId: event.merchantAccountId,
            changeAmount: event.refundAmount,
            changeType: 'CREDIT', // Reverse the DEBIT
            reason: `Compensation for failed refund ${event.aggregateId}`,
            transactionId: event.aggregateId,
            correlationId: event.correlationId,
            actorId: event.metadata?.actorId,
          });

          await this.commandBus.execute(compensateUpdateCommand);

          await this.sagaCoordinator.recordCompensation(
            event.aggregateId,
            'credit_merchant_rollback',
            merchantNewBalance,
          );

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Refund failed after merchant debit: ${errorObj.message}`,
            [
              {
                accountId: event.merchantAccountId,
                action: 'CREDIT',
                amount: event.refundAmount,
                reason:
                  'Rollback of merchant debit due to customer credit failure',
              },
            ],
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateCommand);

          await this.sagaCoordinator.completeCompensation(event.aggregateId);

          this.logger.warn(
            `SAGA: Refund compensated [txId=${event.aggregateId}]`,
          );
        } catch (compensationError) {
          const compErrorStack =
            compensationError instanceof Error
              ? compensationError.stack
              : undefined;
          this.logger.error(
            `SAGA: COMPENSATION FAILED - MANUAL INTERVENTION REQUIRED [txId=${event.aggregateId}, corr=${event.correlationId}]`,
            compErrorStack,
          );
          // Still try to mark as failed
          try {
            const failCommand = new FailTransactionCommand(
              event.aggregateId,
              `Refund failed and compensation also failed: ${errorObj.message}`,
              'COMPENSATION_FAILED',
              event.correlationId,
              event.metadata?.actorId,
            );
            await this.commandBus.execute(failCommand);
          } catch (failError) {
            const failErrorStack =
              failError instanceof Error ? failError.stack : undefined;
            this.logger.error(
              `SAGA: Failed to mark as failed [txId=${event.aggregateId}]`,
              failErrorStack,
            );
          }
        }
      } else {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: false,
        });

        // No compensation needed, just fail
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            errorObj.message,
            errorCode ?? 'REFUND_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
        } catch (failError) {
          const failErrorStack =
            failError instanceof Error ? failError.stack : undefined;
          this.logger.error(
            `SAGA: Failed to mark refund as failed [txId=${event.aggregateId}]`,
            failErrorStack,
          );
        }
      }
    }
  }
}
