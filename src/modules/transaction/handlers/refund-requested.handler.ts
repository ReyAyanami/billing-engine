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
      `📨 SAGA: Handling RefundRequestedEvent: ${event.aggregateId}`,
    );
    this.logger.log(`   Original Payment: ${event.originalPaymentId}`);
    this.logger.log(`   Merchant: ${event.merchantAccountId}`);
    this.logger.log(`   Customer: ${event.customerAccountId}`);
    this.logger.log(
      `   Refund Amount: ${event.refundAmount} ${event.currency}`,
    );

    if (event.refundMetadata?.reason) {
      this.logger.log(`   Reason: ${event.refundMetadata.reason}`);
    }

    let merchantNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the merchant account
      this.logger.log(`   ⚙️  Step 1: Debiting merchant account...`);

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
      this.logger.log(`   ✅ Merchant account debited: ${merchantNewBalance}`);

      // Step 2: CREDIT the customer account
      this.logger.log(`   ⚙️  Step 2: Crediting customer account...`);

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
      this.logger.log(`   ✅ Customer account credited: ${customerNewBalance}`);

      // Step 3: Complete the refund
      this.logger.log(`   ⚙️  Step 3: Completing refund...`);

      // At this point, merchantNewBalance is guaranteed to be defined
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
      this.logger.log(`   ✅ Refund completed: ${event.aggregateId}`);

      this.logger.log(`✅ SAGA: Refund completed successfully!`);
    } catch (error) {
      // Step 4 (on failure): Compensate and fail the refund
      this.logger.error(`   ❌ SAGA: Refund failed: ${error.message}`);

      // Check if we need compensation (merchant was debited)
      if (merchantNewBalance) {
        this.logger.log(
          `   ⚙️  Step 4a: Compensating - crediting merchant account back...`,
        );

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
          this.logger.log(`   ✅ Merchant account compensated (credited back)`);

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
          this.logger.log(`   ✅ Refund marked as COMPENSATED`);
          this.logger.log(
            `✅ SAGA: Refund compensated successfully (rolled back)`,
          );
        } catch (compensationError) {
          this.logger.error(
            `   ❌ SAGA: CRITICAL - Compensation failed! Manual intervention needed.`,
            compensationError,
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
              `   ❌ SAGA: Failed to mark as failed`,
              failError,
            );
          }
        }
      } else {
        // No compensation needed, just fail
        this.logger.log(
          `   ⚙️  Step 4b: No compensation needed (merchant not yet debited)`,
        );
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            error.message,
            error.code || 'REFUND_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
          this.logger.log(`   ✅ Refund marked as failed`);
        } catch (failError) {
          this.logger.error(
            `   ❌ SAGA: Failed to mark refund as failed`,
            failError,
          );
        }
      }
    }
  }
}
