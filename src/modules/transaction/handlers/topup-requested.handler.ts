import { IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { SagaHandler } from '../../../cqrs/decorators/saga-handler.decorator';
import { SagaCoordinator } from '../../../cqrs/saga/saga-coordinator.service';
import { TopupRequestedEvent } from '../events/topup-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteTopupCommand } from '../commands/complete-topup.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';

/**
 * Saga Coordinator for Topup transactions
 *
 * Orchestrates the topup business process:
 * 1. Listen for TopupRequested event
 * 2. Update account balance (via UpdateBalanceCommand)
 * 3. On success: Complete transaction (via CompleteTopupCommand)
 * 4. On failure: Fail transaction (via FailTransactionCommand)
 *
 * This ensures consistency across Transaction and Account aggregates.
 * Runs synchronously and tracks saga state for monitoring.
 */
@Injectable()
@SagaHandler(TopupRequestedEvent)
export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedHandler.name);

  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: TopupRequestedEvent): Promise<void> {
    // Start saga tracking
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'topup',
      correlationId: event.correlationId,
      steps: ['update_balance', 'complete_transaction'],
      metadata: event.metadata,
    });

    this.logger.log(
      `SAGA: Topup initiated [txId=${event.aggregateId}, accountId=${event.accountId}, ` +
        `amt=${event.amount} ${event.currency}]`,
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

      // Mark step complete
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'update_balance',
        result: { newBalance },
      });

      // Step 2: Complete the transaction
      const completeCommand = new CompleteTopupCommand(
        event.aggregateId,
        newBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      // Mark saga complete
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { newBalance },
      });

      this.logger.log(
        `SAGA: Topup completed [txId=${event.aggregateId}, balance=${newBalance}]`,
      );
    } catch (error: unknown) {
      // Saga failed - mark as failed and fail the transaction
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const errorCode = (error as { code?: string })?.code ?? undefined;

      this.logger.error(
        `SAGA: Topup failed [txId=${event.aggregateId}]`,
        errorObj.stack,
      );

      // Mark saga as failed
      await this.sagaCoordinator.failSaga({
        sagaId: event.aggregateId,
        step: 'update_balance', // Failed during this step
        error: errorObj,
        canCompensate: false, // Topup doesn't need compensation
      });

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          errorObj.message,
          errorCode ?? 'TOPUP_FAILED',
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
