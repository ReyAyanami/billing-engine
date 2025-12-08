import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { PaymentRequestedEvent } from '../events/payment-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { CompensateTransactionCommand } from '../commands/compensate-transaction.command';

/**
 * Event handler for PaymentRequestedEvent (Saga Coordinator).
 *
 * This implements the Transaction Saga pattern for payments:
 * 1. Listen for PaymentRequested
 * 2. Update CUSTOMER account balance (DEBIT)
 * 3. Update MERCHANT account balance (CREDIT)
 * 4. On success: Complete transaction (via CompletePaymentCommand)
 * 5. On failure: Compensate + Fail transaction
 *
 * Payment is similar to Transfer but with semantic difference:
 * - Transfer: User-to-user (P2P)
 * - Payment: Customer-to-merchant (C2B)
 */
@EventsHandler(PaymentRequestedEvent)
export class PaymentRequestedHandler implements IEventHandler<PaymentRequestedEvent> {
  private readonly logger = new Logger(PaymentRequestedHandler.name);

  constructor(private commandBus: CommandBus) {}

  async handle(event: PaymentRequestedEvent): Promise<void> {
    this.logger.log(
      `SAGA: Payment initiated [txId=${event.aggregateId}, customer=${event.customerAccountId}, ` +
        `merchant=${event.merchantAccountId}, amt=${event.amount} ${event.currency}, corr=${event.correlationId}]`,
    );

    let customerNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the customer account
      const debitCommand = new UpdateBalanceCommand({
        accountId: event.customerAccountId,
        changeAmount: event.amount,
        changeType: 'DEBIT',
        reason: `Payment to merchant ${event.merchantAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      customerNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(debitCommand);

      // Step 2: CREDIT the merchant account
      const creditCommand = new UpdateBalanceCommand({
        accountId: event.merchantAccountId,
        changeAmount: event.amount,
        changeType: 'CREDIT',
        reason: `Payment from customer ${event.customerAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const merchantNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(creditCommand);

      // Step 3: Complete the payment
      if (!customerNewBalance) {
        throw new Error('Customer balance update failed');
      }

      const completeCommand = new CompletePaymentCommand(
        event.aggregateId,
        customerNewBalance,
        merchantNewBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      this.logger.log(
        `SAGA: Payment completed [txId=${event.aggregateId}, customerBal=${customerNewBalance}, merchantBal=${merchantNewBalance}]`,
      );
    } catch (error) {
      // Step 4 (on failure): Compensate and fail the payment
      const failureStep = customerNewBalance
        ? 'credit_merchant'
        : 'debit_customer';
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = error?.code as string | undefined;

      this.logger.error(
        `SAGA: Payment failed [txId=${event.aggregateId}, corr=${event.correlationId}, step=${failureStep}]`,
        errorStack,
      );

      // Check if we need compensation (customer was debited)
      if (customerNewBalance) {
        try {
          // COMPENSATION: Credit back the customer account
          const compensateUpdateCommand = new UpdateBalanceCommand({
            accountId: event.customerAccountId,
            changeAmount: event.amount,
            changeType: 'CREDIT', // Reverse the DEBIT
            reason: `Compensation for failed payment ${event.aggregateId}`,
            transactionId: event.aggregateId,
            correlationId: event.correlationId,
            actorId: event.metadata?.actorId,
          });

          await this.commandBus.execute(compensateUpdateCommand);

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Payment failed after customer debit: ${errorMessage}`,
            [
              {
                accountId: event.customerAccountId,
                action: 'CREDIT',
                amount: event.amount,
                reason:
                  'Rollback of customer debit due to merchant credit failure',
              },
            ],
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateCommand);
          this.logger.warn(
            `SAGA: Payment compensated [txId=${event.aggregateId}, corr=${event.correlationId}]`,
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
              `Payment failed and compensation also failed: ${errorMessage}`,
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
        // No compensation needed, just fail
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            errorMessage,
            errorCode || 'PAYMENT_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
        } catch (failError) {
          const failErrorStack =
            failError instanceof Error ? failError.stack : undefined;
          this.logger.error(
            `SAGA: Failed to mark payment as failed [txId=${event.aggregateId}]`,
            failErrorStack,
          );
        }
      }
    }
  }
}
