import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CreateAccountCommand } from '../commands/create-account.command';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CreateAccountCommand.
 * This demonstrates the full event sourcing flow:
 * 1. Create aggregate
 * 2. Execute command (emits events)
 * 3. Save events to event store (Kafka)
 * 4. Publish events to event bus (for async handlers)
 */
@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler implements ICommandHandler<CreateAccountCommand> {
  private readonly logger = new Logger(CreateAccountHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CreateAccountCommand): Promise<void> {
    this.logger.log(`Creating account: ${command.accountId}`);

    try {
      // Create new aggregate instance
      const account = new AccountAggregate();

      // Execute the create command (this emits events)
      account.create({
        accountId: command.accountId,
        ownerId: command.ownerId,
        ownerType: command.ownerType,
        accountType: command.accountType,
        currency: command.currency,
        maxBalance: command.maxBalance,
        minBalance: command.minBalance,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      // Get uncommitted events from the aggregate
      const events = account.getUncommittedEvents();

      this.logger.log(`Generated ${events.length} event(s) for account ${command.accountId}`);

      // Save events to the event store (Kafka)
      await this.eventStore.append('Account', command.accountId, events);

      // Publish events to the event bus for async processing
      // (projections, notifications, etc.)
      events.forEach((event) => {
        this.eventBus.publish(event);
      });

      // Mark events as committed
      account.commit();

      this.logger.log(`✅ Account created successfully: ${command.accountId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create account ${command.accountId}`, error);
      throw error;
    }
  }
}

