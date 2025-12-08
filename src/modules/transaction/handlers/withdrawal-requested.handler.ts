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
      `SAGA: Withdrawal initiated [txId=${event.aggregateId}, accountId=${event.accountId}, ` +
        `amt=${event.amount} ${event.currency}, corr=${event.correlationId}]`,
    );

    try {
      // Step 1: Update account balance (DEBIT)
      const updateBalanceCommand = new UpdateBalanceCommand({
        accountId: event.accountId,
        changeAmount: event.amount,
        changeType: 'DEBIT', // Withdrawal is always a debit
        reason: `Withdrawal from transaction ${event.aggregateId}`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const newBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(updateBalanceCommand);

      // Step 2: Complete the transaction
      const completeCommand = new CompleteWithdrawalCommand(
        event.aggregateId,
        newBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      this.logger.log(
        `SAGA: Withdrawal completed [txId=${event.aggregateId}, balance=${newBalance}]`,
      );
    } catch (error) {
      // Step 3 (on failure): Fail the transaction
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = error?.code as string | undefined;

      this.logger.error(
        `SAGA: Withdrawal failed [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        errorStack,
      );

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          errorMessage,
          errorCode || 'WITHDRAWAL_FAILED',
          event.correlationId,
          event.metadata?.actorId,
        );

        await this.commandBus.execute(failCommand);
      } catch (failError) {
        const failErrorStack =
          failError instanceof Error ? failError.stack : undefined;
        this.logger.error(
          `SAGA: Failed to mark transaction as failed [txId=${event.aggregateId}]`,
          failErrorStack,
        );
      }
    }
  }
}
