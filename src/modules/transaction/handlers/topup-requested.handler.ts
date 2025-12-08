import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TopupRequestedEvent } from '../events/topup-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteTopupCommand } from '../commands/complete-topup.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';

/**
 * Event handler for TopupRequestedEvent (Saga Coordinator).
 *
 * This implements the Transaction Saga pattern:
 * 1. Listen for TopupRequested
 * 2. Update account balance (via UpdateBalanceCommand)
 * 3. On success: Complete transaction (via CompleteTopupCommand)
 * 4. On failure: Fail transaction (via FailTransactionCommand)
 *
 * This ensures consistency across Transaction and Account aggregates.
 */
@EventsHandler(TopupRequestedEvent)
export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedHandler.name);

  constructor(private commandBus: CommandBus) {}

  async handle(event: TopupRequestedEvent): Promise<void> {
    this.logger.log(
      `SAGA: Topup initiated [txId=${event.aggregateId}, accountId=${event.accountId}, ` +
        `amt=${event.amount} ${event.currency}, corr=${event.correlationId}]`,
    );

    try {
      // Step 1: Update account balance
      const updateBalanceCommand = new UpdateBalanceCommand({
        accountId: event.accountId,
        changeAmount: event.amount,
        changeType: 'CREDIT', // Topup is always a credit
        reason: `Topup from transaction ${event.aggregateId}`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const newBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(updateBalanceCommand);

      // Step 2: Complete the transaction
      const completeCommand = new CompleteTopupCommand(
        event.aggregateId,
        newBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      this.logger.log(
        `SAGA: Topup completed [txId=${event.aggregateId}, balance=${newBalance}]`,
      );
    } catch (error) {
      // Step 3 (on failure): Fail the transaction
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = error?.code as string | undefined;

      this.logger.error(
        `SAGA: Topup failed [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        errorStack,
      );

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          errorMessage,
          errorCode || 'TOPUP_FAILED',
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
