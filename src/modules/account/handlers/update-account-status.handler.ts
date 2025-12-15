import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateAccountStatusCommand } from '../commands/update-account-status.command';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for UpdateAccountStatusCommand.
 * Loads account aggregate from events, updates status, persists events.
 *
 * This ensures status changes go through proper event sourcing flow.
 */
@CommandHandler(UpdateAccountStatusCommand)
export class UpdateAccountStatusHandler implements ICommandHandler<UpdateAccountStatusCommand> {
  private readonly logger = new Logger(UpdateAccountStatusHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: UpdateAccountStatusCommand): Promise<{
    id: string;
    ownerId: string;
    ownerType: string;
    accountType: string;
    currency: string;
    balance: string;
    status: string;
    maxBalance?: string;
    minBalance?: string;
  }> {
    this.logger.log(
      `Updating status for account: ${command.accountId} to ${command.newStatus}`,
    );

    try {
      const events = await this.eventStore.getEvents(
        'Account',
        command.accountId,
      );

      if (events.length === 0) {
        throw new Error(`Account not found: ${command.accountId}`);
      }

      const account = AccountAggregate.fromEvents(events);

      account.changeStatus({
        newStatus: command.newStatus,
        reason: command.reason,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      const newEvents = account.getUncommittedEvents();
      this.logger.log(
        `Generated ${newEvents.length} event(s) for account ${command.accountId}`,
      );

      await this.eventStore.append('Account', command.accountId, newEvents);

      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      account.commit();

      this.logger.log(
        `✅ Status updated for account: ${command.accountId} (${command.newStatus})`,
      );
      return {
        id: command.accountId,
        ownerId: account.getOwnerId(),
        ownerType: account.getOwnerType(),
        accountType: account.getAccountType(),
        currency: account.getCurrency(),
        balance: account.getBalance().toFixed(8),
        status: account.getStatus(),
        maxBalance: account.getMaxBalance()?.toFixed(8),
        minBalance: account.getMinBalance()?.toFixed(8),
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to update status for account ${command.accountId}`,
        error,
      );
      throw error;
    }
  }
}
