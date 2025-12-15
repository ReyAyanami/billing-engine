import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountProjection } from '../projections/account-projection.entity';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';
import { AccountId } from '../../../common/types/branded.types';

/**
 * Service for rebuilding account projections from event store.
 * Used for:
 * - Recovering from projection corruption
 * - Fixing projection inconsistencies
 * - Debugging event sourcing issues
 * - Migrating projection schema
 */
@Injectable()
export class AccountProjectionRebuildService {
  private readonly logger = new Logger(AccountProjectionRebuildService.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    @InjectRepository(AccountProjection)
    private projectionRepository: Repository<AccountProjection>,
  ) {}

  /**
   * Rebuild a single account projection from its events
   */
  async rebuildAccount(accountId: AccountId): Promise<AccountProjection> {
    this.logger.log(`Rebuilding projection for account: ${accountId}`);

    const events = await this.eventStore.getEvents('Account', accountId);

    if (events.length === 0) {
      throw new Error(`No events found for account: ${accountId}`);
    }

    const aggregate = AccountAggregate.fromEvents(events);
    const lastEvent = events[events.length - 1]!;
    const firstEvent = events[0]!;

    const projection = await this.projectionRepository.findOne({
      where: { id: accountId },
    });

    const aggregateState = {
      id: accountId,
      ownerId: aggregate.getOwnerId(),
      ownerType: aggregate.getOwnerType(),
      accountType: aggregate.getAccountType(),
      currency: aggregate.getCurrency(),
      balance: aggregate.getBalance().toFixed(8),
      status: aggregate.getStatus(),
      maxBalance: aggregate.getMaxBalance() ? aggregate.getMaxBalance()!.toFixed(8) : null,
      minBalance: aggregate.getMinBalance() ? aggregate.getMinBalance()!.toFixed(8) : null,
      aggregateVersion: aggregate.getVersion(),
      lastEventId: lastEvent.eventId,
      lastEventTimestamp: lastEvent.timestamp,
    };

    if (projection) {
      Object.assign(projection, aggregateState);
      projection.updatedAt = new Date();
      await this.projectionRepository.save(projection);
      this.logger.log(`✅ Account projection rebuilt: ${accountId}`);
    } else {
      const newProjection = this.projectionRepository.create({
        ...aggregateState,
        createdAt: firstEvent.timestamp,
      });
      await this.projectionRepository.save(newProjection);
      this.logger.log(`✅ Account projection created: ${accountId}`);
    }

    return await this.projectionRepository.findOne({
      where: { id: accountId },
    }) as AccountProjection;
  }

  /**
   * Rebuild all account projections (use with caution)
   */
  async rebuildAllAccounts(): Promise<{
    total: number;
    successful: number;
    failed: string[];
  }> {
    this.logger.warn('Starting rebuild of ALL account projections...');

    const allProjections = await this.projectionRepository.find();
    const results = {
      total: allProjections.length,
      successful: 0,
      failed: [] as string[],
    };

    for (const projection of allProjections) {
      try {
        await this.rebuildAccount(projection.id as AccountId);
        results.successful++;
      } catch (error) {
        this.logger.error(
          `Failed to rebuild account ${projection.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        results.failed.push(projection.id);
      }
    }

    this.logger.log(
      `✅ Rebuild complete: ${results.successful}/${results.total} successful`,
    );

    return results;
  }
}

