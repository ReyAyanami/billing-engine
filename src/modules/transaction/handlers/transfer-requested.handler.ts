import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransferRequestedEvent } from '../events/transfer-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompleteTransferCommand } from '../commands/complete-transfer.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { CompensateTransactionCommand } from '../commands/compensate-transaction.command';

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
    this.logger.log(
      `SAGA: Transfer initiated [txId=${event.aggregateId}, src=${event.sourceAccountId}, ` +
        `dst=${event.destinationAccountId}, amt=${event.amount} ${event.currency}, corr=${event.correlationId}]`,
    );

    let sourceNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the source account
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

      this.logger.log(
        `SAGA: Transfer completed [txId=${event.aggregateId}, srcBal=${sourceNewBalance}, dstBal=${destinationNewBalance}]`,
      );
    } catch (error) {
      // Step 4 (on failure): Compensate and fail the transaction
      const failureStep = sourceNewBalance
        ? 'credit_destination'
        : 'debit_source';
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorCode = error?.code as string | undefined;

      this.logger.error(
        `SAGA: Transfer failed [txId=${event.aggregateId}, corr=${event.correlationId}, step=${failureStep}]`,
        errorStack,
      );

      // Check if we need compensation (source was debited)
      if (sourceNewBalance) {
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

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Transfer failed after source debit: ${errorMessage}`,
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
          this.logger.warn(
            `SAGA: Transfer compensated [txId=${event.aggregateId}, corr=${event.correlationId}]`,
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
              `Transfer failed and compensation also failed: ${errorMessage}`,
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
            errorCode || 'TRANSFER_FAILED',
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
