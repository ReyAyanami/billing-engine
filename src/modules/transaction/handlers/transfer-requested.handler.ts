import { IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { SagaHandler } from '../../../cqrs/decorators/saga-handler.decorator';
import { SagaCoordinator } from '../../../cqrs/saga/saga-coordinator.service';
import { TransferRequestedEvent } from '../events/transfer-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteTransferCommand } from '../commands/complete-transfer.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { CompensateTransactionCommand } from '../commands/compensate-transaction.command';
import { ReserveBalanceCommand } from '../../account/commands/reserve-balance.command';

/**
 * Saga Coordinator for Transfer transactions
 *
 * Orchestrates peer-to-peer transfers with compensation:
 * 1. DEBIT source account
 * 2. CREDIT destination account
 * 3. Complete transaction OR compensate on failure
 */
@Injectable()
@SagaHandler(TransferRequestedEvent)
export class TransferRequestedHandler implements IEventHandler<TransferRequestedEvent> {
  private readonly logger = new Logger(TransferRequestedHandler.name);

  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: TransferRequestedEvent): Promise<void> {
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'transfer',
      correlationId: event.correlationId,
      steps: [
        'reserve_source',
        'debit_source',
        'credit_destination',
        'complete_transaction',
      ],
      metadata: event.metadata,
    });

    this.logger.log(
      `SAGA: Transfer initiated [txId=${event.aggregateId}, src=${event.sourceAccountId}, dst=${event.destinationAccountId}]`,
    );

    let sourceNewBalance: string | undefined;

    try {
      // Step 1: RESERVE funds from source
      const reserveCommand = new ReserveBalanceCommand({
        accountId: event.sourceAccountId,
        amount: event.amount,
        targetRegionId: process.env['REGION_ID'] || 'unknown',
        reason: `Reservation for transfer to ${event.destinationAccountId} (tx: ${event.aggregateId})`,
        correlationId: event.correlationId,
        metadata: event.metadata as unknown as Record<
          string,
          string | number | boolean | undefined
        >,
      });

      await this.commandBus.execute(reserveCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'reserve_source',
        result: { amount: event.amount },
      });

      // Step 2: DEBIT the source account
      const debitCommand = new UpdateBalanceCommand({
        accountId: event.sourceAccountId,
        changeAmount: event.amount,
        changeType: 'DEBIT',
        reason: `Transfer to ${event.destinationAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      sourceNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(debitCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'debit_source',
        result: { sourceNewBalance },
      });

      // Step 2: CREDIT the destination account
      const creditCommand = new UpdateBalanceCommand({
        accountId: event.destinationAccountId,
        changeAmount: event.amount,
        changeType: 'CREDIT',
        reason: `Transfer from ${event.sourceAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const destinationNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(creditCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'credit_destination',
        result: { destinationNewBalance },
      });

      // Step 3: Complete the transaction
      if (!sourceNewBalance) {
        throw new Error('Source balance update failed');
      }

      const completeCommand = new CompleteTransferCommand(
        event.aggregateId,
        sourceNewBalance,
        destinationNewBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { sourceNewBalance, destinationNewBalance },
      });

      this.logger.log(`SAGA: Transfer completed [txId=${event.aggregateId}]`);
    } catch (error: unknown) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const failureStep = sourceNewBalance
        ? 'credit_destination'
        : 'debit_source';
      const errorCode = (error as { code?: string })?.code;

      this.logger.error(
        `SAGA: Transfer failed [txId=${event.aggregateId}, step=${failureStep}]`,
        errorObj.stack,
      );

      // Check if we need compensation (source was debited)
      if (sourceNewBalance) {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: true,
        });
        try {
          // COMPENSATION: Credit back the source account
          const compensateUpdateCommand = new UpdateBalanceCommand({
            accountId: event.sourceAccountId,
            changeAmount: event.amount,
            changeType: 'CREDIT', // Reverse the DEBIT
            reason: `Compensation for failed transfer ${event.aggregateId}`,
            transactionId: event.aggregateId,
            correlationId: event.correlationId,
            actorId: event.metadata?.actorId,
          });

          await this.commandBus.execute(compensateUpdateCommand);

          await this.sagaCoordinator.recordCompensation(
            event.aggregateId,
            'credit_source_rollback',
            sourceNewBalance,
          );

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Transfer failed after source debit: ${errorObj.message}`,
            [
              {
                accountId: event.sourceAccountId,
                action: 'CREDIT',
                amount: event.amount,
                reason:
                  'Rollback of source debit due to destination credit failure',
              },
            ],
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateCommand);

          await this.sagaCoordinator.completeCompensation(event.aggregateId);

          this.logger.warn(
            `SAGA: Transfer compensated [txId=${event.aggregateId}]`,
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
              `Transfer failed and compensation also failed: ${errorObj.message}`,
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
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: false,
        });

        // No compensation needed, just fail
        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            errorObj.message,
            errorCode ?? 'TRANSFER_FAILED',
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
}
