import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { WithdrawalCommand } from '../commands/withdrawal.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for WithdrawalCommand.
 * Creates a transaction aggregate, requests withdrawal, and persists events.
 */
@CommandHandler(WithdrawalCommand)
export class WithdrawalHandler implements ICommandHandler<WithdrawalCommand> {
  private readonly logger = new Logger(WithdrawalHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: WithdrawalCommand): Promise<string> {
    this.logger.log(
      `[WithdrawalHandler] Processing [txId=${command.transactionId}, accountId=${command.accountId}, ` +
        `amt=${command.amount}, corr=${command.correlationId}]`,
    );

    try {
      const transaction = new TransactionAggregate();

      transaction.requestWithdrawal({
        transactionId: command.transactionId,
        accountId: command.accountId,
        amount: command.amount,
        currency: command.currency,
        destinationAccountId: command.destinationAccountId,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      const events = transaction.getUncommittedEvents();
      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        events,
      );

      events.forEach((event) => {
        this.eventBus.publish(event);
      });

      transaction.commit();

      this.logger.log(
        `[WithdrawalHandler] Completed [txId=${command.transactionId}]`,
      );

      return command.transactionId;
    } catch (error: unknown) {
      this.logger.error(
        `[WithdrawalHandler] Failed [txId=${command.transactionId}, corr=${command.correlationId}]`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
