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
    this.logger.log(`📨 SAGA: Handling PaymentRequestedEvent: ${event.aggregateId}`);
    this.logger.log(`   Customer: ${event.customerAccountId}`);
    this.logger.log(`   Merchant: ${event.merchantAccountId}`);
    this.logger.log(`   Amount: ${event.amount} ${event.currency}`);
    
    if (event.paymentMetadata?.orderId) {
      this.logger.log(`   Order ID: ${event.paymentMetadata.orderId}`);
    }

    let customerNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the customer account
      this.logger.log(`   ⚙️  Step 1: Debiting customer account...`);
      
      const debitCommand = new UpdateBalanceCommand(
        event.customerAccountId,
        event.amount,
        'DEBIT',
        `Payment to merchant ${event.merchantAccountId} (tx: ${event.aggregateId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      customerNewBalance = await this.commandBus.execute(debitCommand);
      this.logger.log(`   ✅ Customer account debited: ${customerNewBalance}`);

      // Step 2: CREDIT the merchant account
      this.logger.log(`   ⚙️  Step 2: Crediting merchant account...`);
      
      const creditCommand = new UpdateBalanceCommand(
        event.merchantAccountId,
        event.amount,
        'CREDIT',
        `Payment from customer ${event.customerAccountId} (tx: ${event.aggregateId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      const merchantNewBalance = await this.commandBus.execute(creditCommand);
      this.logger.log(`   ✅ Merchant account credited: ${merchantNewBalance}`);

      // Step 3: Complete the payment
      this.logger.log(`   ⚙️  Step 3: Completing payment...`);
      
      // At this point, customerNewBalance is guaranteed to be defined
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
      this.logger.log(`   ✅ Payment completed: ${event.aggregateId}`);

      this.logger.log(`✅ SAGA: Payment completed successfully!`);
    } catch (error) {
      // Step 4 (on failure): Compensate and fail the payment
      this.logger.error(`   ❌ SAGA: Payment failed: ${error.message}`);
      
      // Check if we need compensation (customer was debited)
      if (customerNewBalance) {
        this.logger.log(`   ⚙️  Step 4a: Compensating - crediting customer account back...`);
        
        try {
          // COMPENSATION: Credit back the customer account
          const compensateUpdateCommand = new UpdateBalanceCommand(
            event.customerAccountId,
            event.amount,
            'CREDIT', // Reverse the DEBIT
            `Compensation for failed payment ${event.aggregateId}`,
            event.aggregateId,
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateUpdateCommand);
          this.logger.log(`   ✅ Customer account compensated (credited back)`);

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Payment failed after customer debit: ${error.message}`,
            [
              {
                accountId: event.customerAccountId,
                action: 'CREDIT',
                amount: event.amount,
                reason: 'Rollback of customer debit due to merchant credit failure',
              },
            ],
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateCommand);
          this.logger.log(`   ✅ Payment marked as COMPENSATED`);
          this.logger.log(`✅ SAGA: Payment compensated successfully (rolled back)`);
        } catch (compensationError) {
          this.logger.error(
            `   ❌ SAGA: CRITICAL - Compensation failed! Manual intervention needed.`,
            compensationError,
          );
          // Still try to mark as failed
          try {
            const failCommand = new FailTransactionCommand(
              event.aggregateId,
              `Payment failed and compensation also failed: ${error.message}`,
              'COMPENSATION_FAILED',
              event.correlationId,
              event.metadata?.actorId,
            );
            await this.commandBus.execute(failCommand);
          } catch (failError) {
            this.logger.error(`   ❌ SAGA: Failed to mark as failed`, failError);
          }
        }
      } else {
        // No compensation needed, just fail
        this.logger.log(`   ⚙️  Step 4b: No compensation needed (customer not yet debited)`);
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            error.message,
            error.code || 'PAYMENT_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
          this.logger.log(`   ✅ Payment marked as failed`);
        } catch (failError) {
          this.logger.error(`   ❌ SAGA: Failed to mark payment as failed`, failError);
        }
      }
    }
  }
}

