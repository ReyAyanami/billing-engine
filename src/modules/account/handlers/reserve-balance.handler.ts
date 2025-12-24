import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { ReserveBalanceCommand } from '../commands/reserve-balance.command';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for ReserveBalanceCommand.
 * Allocates unreserved balance to a specific region's reservation pool.
 */
@CommandHandler(ReserveBalanceCommand)
export class ReserveBalanceHandler implements ICommandHandler<ReserveBalanceCommand> {
    private readonly logger = new Logger(ReserveBalanceHandler.name);

    constructor(
        @Inject('EVENT_STORE') private eventStore: IEventStore,
        private eventBus: EventBus,
    ) { }

    async execute(command: ReserveBalanceCommand): Promise<string> {
        this.logger.log(
            `Requesting reservation of ${command.amount} for account ${command.accountId} in region ${command.targetRegionId}`
        );

        const events = await this.eventStore.getEvents('Account', command.accountId);
        if (events.length === 0) {
            throw new Error(`Account not found: ${command.accountId}`);
        }

        const account = AccountAggregate.fromEvents(events);

        account.reserve({
            amount: command.amount,
            targetRegionId: command.targetRegionId,
            correlationId: command.correlationId,
            causationId: command.commandId,
            metadata: {
                ...command.metadata,
                reason: command.reason,
            },
        });

        const newEvents = account.getUncommittedEvents();

        await this.eventStore.append('Account', command.accountId, newEvents);

        newEvents.forEach((event) => {
            this.eventBus.publish(event);
        });

        account.commit();

        const newReservation = account.getReservation(command.targetRegionId).toString();
        this.logger.log(
            `✅ Reservation increased for account ${command.accountId} in ${command.targetRegionId}. ` +
            `New local reservation: ${newReservation}`
        );

        return newReservation;
    }
}
