import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
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
@EventsHandler(RefundRequestedEvent)
export class RefundRequestedHandler implements IEventHandler<RefundRequestedEvent> {
  private readonly logger = new Logger(RefundRequestedHandler.name);

  constructor(private commandBus: CommandBus) {}

  async handle(event: RefundRequestedEvent): Promise<void> {
    this.logger.log(
      `SAGA: Refund initiated [txId=${event.aggregateId}, paymentId=${event.originalPaymentId}, ` +
      `merchant=${event.merchantAccountId}, customer=${event.customerAccountId}, ` +
      `amt=${event.refundAmount} ${event.currency}, corr=${event.correlationId}]`,
    );

    let merchantNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the merchant account
      const debitCommand = new UpdateBalanceCommand(
        event.merchantAccountId,
        event.refundAmount,
        'DEBIT',
        `Refund to customer ${event.customerAccountId} (refund: ${event.aggregateId}, payment: ${event.originalPaymentId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      merchantNewBalance = await this.commandBus.execute(debitCommand);

      // Step 2: CREDIT the customer account
      const creditCommand = new UpdateBalanceCommand(
        event.customerAccountId,
        event.refundAmount,
        'CREDIT',
        `Refund from merchant ${event.merchantAccountId} (refund: ${event.aggregateId}, payment: ${event.originalPaymentId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      const customerNewBalance = await this.commandBus.execute(creditCommand);

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

      this.logger.log(
        `SAGA: Refund completed [txId=${event.aggregateId}, merchantBal=${merchantNewBalance}, customerBal=${customerNewBalance}]`,
      );
    } catch (error) {
      // Step 4 (on failure): Compensate and fail the refund
      const failureStep = merchantNewBalance ? 'credit_customer' : 'debit_merchant';
      this.logger.error(
        `SAGA: Refund failed [txId=${event.aggregateId}, corr=${event.correlationId}, step=${failureStep}]`,
        error.stack,
      );

      // Check if we need compensation (merchant was debited)
      if (merchantNewBalance) {
        try {
          // COMPENSATION: Credit back the merchant account
          const compensateUpdateCommand = new UpdateBalanceCommand(
            event.merchantAccountId,
            event.refundAmount,
            'CREDIT', // Reverse the DEBIT
            `Compensation for failed refund ${event.aggregateId}`,
            event.aggregateId,
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateUpdateCommand);

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Refund failed after merchant debit: ${error.message}`,
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
          this.logger.warn(
            `SAGA: Refund compensated [txId=${event.aggregateId}, corr=${event.correlationId}]`,
          );
        } catch (compensationError) {
          this.logger.error(
            `SAGA: COMPENSATION FAILED - MANUAL INTERVENTION REQUIRED [txId=${event.aggregateId}, corr=${event.correlationId}]`,
            compensationError.stack,
          );
          // Still try to mark as failed
          try {
            const failCommand = new FailTransactionCommand(
              event.aggregateId,
              `Refund failed and compensation also failed: ${error.message}`,
              'COMPENSATION_FAILED',
              event.correlationId,
              event.metadata?.actorId,
            );
            await this.commandBus.execute(failCommand);
          } catch (failError) {
            this.logger.error(
              `SAGA: Failed to mark as failed [txId=${event.aggregateId}]`,
              failError.stack,
            );
          }
        }
      } else {
        // No compensation needed, just fail
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            error.message,
            error.code || 'REFUND_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
        } catch (failError) {
          this.logger.error(
            `SAGA: Failed to mark refund as failed [txId=${event.aggregateId}]`,
            failError.stack,
          );
        }
      }
    }
  }
}
