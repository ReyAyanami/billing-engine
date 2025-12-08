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
      const debitCommand = new UpdateBalanceCommand({
        accountId: event.merchantAccountId,
        changeAmount: event.refundAmount,
        changeType: 'DEBIT',
        reason: `Refund to customer ${event.customerAccountId} (refund: ${event.aggregateId}, payment: ${event.originalPaymentId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      merchantNewBalance = await this.commandBus.execute<UpdateBalanceCommand, string>(debitCommand);

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

      const customerNewBalance = await this.commandBus.execute<UpdateBalanceCommand, string>(creditCommand);

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = (error as any)?.code as string | undefined;
      
      this.logger.error(
        `SAGA: Refund failed [txId=${event.aggregateId}, corr=${event.correlationId}, step=${failureStep}]`,
        errorStack,
      );

      // Check if we need compensation (merchant was debited)
      if (merchantNewBalance) {
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

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Refund failed after merchant debit: ${errorMessage}`,
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
          const compErrorStack = compensationError instanceof Error ? compensationError.stack : undefined;
          this.logger.error(
            `SAGA: COMPENSATION FAILED - MANUAL INTERVENTION REQUIRED [txId=${event.aggregateId}, corr=${event.correlationId}]`,
            compErrorStack,
          );
          // Still try to mark as failed
          try {
            const failCommand = new FailTransactionCommand(
              event.aggregateId,
              `Refund failed and compensation also failed: ${errorMessage}`,
              'COMPENSATION_FAILED',
              event.correlationId,
              event.metadata?.actorId,
            );
            await this.commandBus.execute(failCommand);
          } catch (failError) {
            const failErrorStack = failError instanceof Error ? failError.stack : undefined;
            this.logger.error(
              `SAGA: Failed to mark as failed [txId=${event.aggregateId}]`,
              failErrorStack,
            );
          }
        }
      } else {
        // No compensation needed, just fail
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            errorMessage,
            errorCode || 'REFUND_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
        } catch (failError) {
          const failErrorStack = failError instanceof Error ? failError.stack : undefined;
          this.logger.error(
            `SAGA: Failed to mark refund as failed [txId=${event.aggregateId}]`,
            failErrorStack,
          );
        }
      }
    }
  }
}
