import { IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { SagaHandler } from '../../../cqrs/decorators/saga-handler.decorator';
import { SagaCoordinator } from '../../../cqrs/saga/saga-coordinator.service';
import { WithdrawalRequestedEvent } from '../events/withdrawal-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteWithdrawalCommand } from '../commands/complete-withdrawal.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { ReserveBalanceCommand } from '../../account/commands/reserve-balance.command';

/**
 * Saga Coordinator for Withdrawal transactions
 *
 * Orchestrates the withdrawal business process:
 * 1. Listen for WithdrawalRequested event
 * 2. Update account balance (DEBIT)
 * 3. On success: Complete transaction
 * 4. On failure: Fail transaction
 *
 * Runs synchronously and tracks saga state for monitoring.
 */
@Injectable()
@SagaHandler(WithdrawalRequestedEvent)
export class WithdrawalRequestedHandler implements IEventHandler<WithdrawalRequestedEvent> {
  private readonly logger = new Logger(WithdrawalRequestedHandler.name);

  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: WithdrawalRequestedEvent): Promise<void> {
    // Start saga tracking
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'withdrawal',
      correlationId: event.correlationId,
      steps: ['reserve_funds', 'update_balance', 'complete_transaction'],
      metadata: event.metadata,
    });

    this.logger.log(
      `SAGA: Withdrawal initiated [txId=${event.aggregateId}, accountId=${event.accountId}, ` +
        `amt=${event.amount} ${event.currency}]`,
    );

    try {
      // Step 1: Reserve funds
      const reserveCommand = new ReserveBalanceCommand({
        accountId: event.accountId,
        amount: event.amount,
        targetRegionId: process.env['REGION_ID'] || 'unknown',
        reason: `Reservation for withdrawal ${event.aggregateId}`,
        correlationId: event.correlationId,
        metadata: event.metadata as unknown as Record<
          string,
          string | number | boolean | undefined
        >,
      });

      await this.commandBus.execute(reserveCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'reserve_funds',
        result: { amount: event.amount },
      });

      // Step 2: Update account balance (DEBIT)
      const updateBalanceCommand = new UpdateBalanceCommand({
        accountId: event.accountId,
        changeAmount: event.amount,
        changeType: 'DEBIT',
        reason: `Withdrawal from transaction ${event.aggregateId}`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const newBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(updateBalanceCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'update_balance',
        result: { newBalance },
      });

      // Step 2: Complete the transaction
      const completeCommand = new CompleteWithdrawalCommand(
        event.aggregateId,
        newBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { newBalance },
      });

      this.logger.log(
        `SAGA: Withdrawal completed [txId=${event.aggregateId}, balance=${newBalance}]`,
      );
    } catch (error: unknown) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const errorCode = (error as { code?: string })?.code ?? undefined;

      this.logger.error(
        `SAGA: Withdrawal failed [txId=${event.aggregateId}]`,
        errorObj.stack,
      );

      await this.sagaCoordinator.failSaga({
        sagaId: event.aggregateId,
        step: 'update_balance',
        error: errorObj,
        canCompensate: false,
      });

      try {
        const failCommand = new FailTransactionCommand(
          event.aggregateId,
          errorObj.message,
          errorCode ?? 'WITHDRAWAL_FAILED',
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
