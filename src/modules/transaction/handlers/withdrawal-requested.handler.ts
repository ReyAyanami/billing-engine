import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { WithdrawalRequestedEvent } from '../events/withdrawal-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteWithdrawalCommand } from '../commands/complete-withdrawal.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';

/**
 * Event handler for WithdrawalRequestedEvent (Saga Coordinator).
 *
 * This implements the Transaction Saga pattern for withdrawals:
 * 1. Listen for WithdrawalRequested
 * 2. Update account balance (via UpdateBalanceCommand - DEBIT)
 * 3. On success: Complete transaction (via CompleteWithdrawalCommand)
 * 4. On failure: Fail transaction (via FailTransactionCommand)
 *
 * This ensures consistency across Transaction and Account aggregates.
 */
@EventsHandler(WithdrawalRequestedEvent)
export class WithdrawalRequestedHandler implements IEventHandler<WithdrawalRequestedEvent> {
  private readonly logger = new Logger(WithdrawalRequestedHandler.name);

  constructor(private commandBus: CommandBus) {}

  async handle(event: WithdrawalRequestedEvent): Promise<void> {
    this.logger.log(
      `📨 SAGA: Handling WithdrawalRequestedEvent: ${event.aggregateId}`,
    );
    this.logger.log(`   Account: ${event.accountId}`);
    this.logger.log(`   Amount: ${event.amount} ${event.currency}`);
    this.logger.log(`   Destination: ${event.destinationAccountId}`);

    try {
      // Step 1: Update account balance (DEBIT)
      this.logger.log(`   ⚙️  Step 1: Debiting account balance...`);

      const updateBalanceCommand = new UpdateBalanceCommand(
        event.accountId,
        event.amount,
        'DEBIT', // Withdrawal is always a debit
        `Withdrawal from transaction ${event.aggregateId}`,
        event.aggregateId,
        event.correlationId,
        event.metadata?.actorId,
      );

      const newBalance = await this.commandBus.execute(updateBalanceCommand);
      this.logger.log(`   ✅ Account balance updated: ${newBalance}`);

      // Step 2: Complete the transaction
      this.logger.log(`   ⚙️  Step 2: Completing transaction...`);

      const completeCommand = new CompleteWithdrawalCommand(
        event.aggregateId,
        newBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);
      this.logger.log(`   ✅ Transaction completed: ${event.aggregateId}`);

      this.logger.log(`✅ SAGA: Withdrawal completed successfully!`);
    } catch (error) {
      // Step 3 (on failure): Fail the transaction
      this.logger.error(`   ❌ SAGA: Withdrawal failed: ${error.message}`);
      this.logger.log(`   ⚙️  Step 3: Marking transaction as failed...`);

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          error.message,
          error.code || 'WITHDRAWAL_FAILED',
          event.correlationId,
          event.metadata?.actorId,
        );

        await this.commandBus.execute(failCommand);
        this.logger.log(`   ✅ Transaction marked as failed`);
      } catch (failError) {
        this.logger.error(
          `   ❌ SAGA: Failed to mark transaction as failed`,
          failError,
        );
        // This is critical - we should alert/retry
      }
    }
  }
}
