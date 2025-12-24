import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler, CommandBus } from '@nestjs/cqrs';
import { ReplenishmentRequestedEvent } from '../events/replenishment-requested.event';
import { ReserveBalanceCommand } from '../commands/reserve-balance.command';
import { ConfigService } from '@nestjs/config';

/**
 * Policy that Reacts to ReplenishmentRequestedEvent.
 * If this instance is running in the Home Region of the account, it issues a ReserveBalanceCommand.
 */
@EventsHandler(ReplenishmentRequestedEvent)
@Injectable()
export class ReplenishmentPolicy implements IEventHandler<ReplenishmentRequestedEvent> {
  private readonly logger = new Logger(ReplenishmentPolicy.name);
  private readonly regionId: string;

  constructor(
    private commandBus: CommandBus,
    private configService: ConfigService,
  ) {
    this.regionId = this.configService.get<string>('REGION_ID', 'unknown');
  }

  async handle(event: ReplenishmentRequestedEvent) {
    // Only the Home Region has authority to allocate reservations from the global pool
    if (this.regionId !== event.homeRegionId) {
      this.logger.debug(
        `Ignoring replenishment request for account ${event.aggregateId} (Region: ${this.regionId}, Home: ${event.homeRegionId})`,
      );
      return;
    }

    this.logger.log(
      `Home Region (${this.regionId}) processing replenishment request from ${event.requestingRegionId} for account ${event.aggregateId}`,
    );

    try {
      await this.commandBus.execute(
        new ReserveBalanceCommand({
          accountId: event.aggregateId,
          amount: event.requestedAmount,
          targetRegionId: event.requestingRegionId,
          reason: `Automatic replenishment requested by region ${event.requestingRegionId}`,
          correlationId: event.correlationId,
          causationId: event.eventId,
        }),
      );
      this.logger.log(
        `✅ Successfully processed replenishment for ${event.aggregateId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to process replenishment for ${event.aggregateId}:`,
        error,
      );
    }
  }
}
