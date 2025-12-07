import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransferRequestedEvent } from '../events/transfer-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteTransferCommand } from '../commands/complete-transfer.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';

/**
 * Event handler for TransferRequestedEvent (Saga Coordinator).
 * 
 * This implements the Transaction Saga pattern for transfers:
 * 1. Listen for TransferRequested
 * 2. Update SOURCE account balance (DEBIT)
 * 3. Update DESTINATION account balance (CREDIT)
 * 4. On success: Complete transaction (via CompleteTransferCommand)
 * 5. On failure: Fail transaction (via FailTransactionCommand)
 * 
 * This ensures consistency across Transaction and TWO Account aggregates.
 * 
 * Note: This is a choreography-based saga. In production, you might want
 * to use orchestration-based saga for better compensation handling.
 */
@EventsHandler(TransferRequestedEvent)
export class TransferRequestedHandler implements IEventHandler<TransferRequestedEvent> {
  private readonly logger = new Logger(TransferRequestedHandler.name);

  constructor(private commandBus: CommandBus) {}

  async handle(event: TransferRequestedEvent): Promise<void> {
    this.logger.log(`📨 SAGA: Handling TransferRequestedEvent: ${event.aggregateId}`);
    this.logger.log(`   Source Account: ${event.sourceAccountId}`);
    this.logger.log(`   Destination Account: ${event.destinationAccountId}`);
    this.logger.log(`   Amount: ${event.amount} ${event.currency}`);

    let sourceNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the source account
      this.logger.log(`   ⚙️  Step 1: Debiting source account...`);
      
      const debitCommand = new UpdateBalanceCommand(
        event.sourceAccountId,
        event.amount,
        'DEBIT',
        `Transfer to ${event.destinationAccountId} (tx: ${event.aggregateId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      sourceNewBalance = await this.commandBus.execute(debitCommand);
      this.logger.log(`   ✅ Source account debited: ${sourceNewBalance}`);

      // Step 2: CREDIT the destination account
      this.logger.log(`   ⚙️  Step 2: Crediting destination account...`);
      
      const creditCommand = new UpdateBalanceCommand(
        event.destinationAccountId,
        event.amount,
        'CREDIT',
        `Transfer from ${event.sourceAccountId} (tx: ${event.aggregateId})`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      const destinationNewBalance = await this.commandBus.execute(creditCommand);
      this.logger.log(`   ✅ Destination account credited: ${destinationNewBalance}`);

      // Step 3: Complete the transaction
      this.logger.log(`   ⚙️  Step 3: Completing transaction...`);
      
      const completeCommand = new CompleteTransferCommand(
        event.aggregateId,
        sourceNewBalance,
        destinationNewBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);
      this.logger.log(`   ✅ Transaction completed: ${event.aggregateId}`);

      this.logger.log(`✅ SAGA: Transfer completed successfully!`);
    } catch (error) {
      // Step 4 (on failure): Fail the transaction
      this.logger.error(`   ❌ SAGA: Transfer failed: ${error.message}`);
      this.logger.log(`   ⚙️  Step 4: Marking transaction as failed...`);

      // TODO: In production, implement compensation here
      // If source was debited but destination credit failed, we should:
      // 1. Credit back the source account (compensating transaction)
      // 2. Then fail the transaction
      // For now, we just fail the transaction
      
      if (sourceNewBalance) {
        this.logger.warn(
          `   ⚠️  WARNING: Source account was debited but transfer failed. ` +
          `Manual compensation may be needed or implement automatic compensation.`
        );
      }

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          error.message,
          error.code || 'TRANSFER_FAILED',
          event.correlationId,
          event.metadata?.actorId,
        );

        await this.commandBus.execute(failCommand);
        this.logger.log(`   ✅ Transaction marked as failed`);
      } catch (failError) {
        this.logger.error(`   ❌ SAGA: Failed to mark transaction as failed`, failError);
        // This is critical - we should alert/retry
      }
    }
  }
}

