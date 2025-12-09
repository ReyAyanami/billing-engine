import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountProjection } from './account-projection.entity';
import { AccountCreatedEvent } from '../events/account-created.event';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { AccountStatusChangedEvent } from '../events/account-status-changed.event';
import { AccountLimitsChangedEvent } from '../events/account-limits-changed.event';
import { AccountId, OwnerId } from '../../../common/types/branded.types';

/**
 * Service for managing account read model projections.
 * Updates PostgreSQL projections from domain events.
 */
@Injectable()
export class AccountProjectionService {
  private readonly logger = new Logger(AccountProjectionService.name);

  constructor(
    @InjectRepository(AccountProjection)
    private projectionRepository: Repository<AccountProjection>,
  ) {}

  /**
   * Creates a new projection from AccountCreatedEvent
   */
  async handleAccountCreated(event: AccountCreatedEvent): Promise<void> {
    this.logger.log(`Creating projection for account: ${event.aggregateId}`);

    const projection = this.projectionRepository.create({
      id: event.aggregateId,
      ownerId: event.ownerId,
      ownerType: event.ownerType,
      accountType: event.accountType,
      currency: event.currency,
      status: event.status,
      balance: '0.00',
      maxBalance: event.maxBalance || null,
      minBalance: event.minBalance || null,
      aggregateVersion: event.aggregateVersion,
      lastEventId: event.eventId,
      lastEventTimestamp: event.timestamp,
    });

    await this.projectionRepository.save(projection);

    this.logger.log(`✅ Projection created for account: ${event.aggregateId}`);
  }

  /**
   * Updates projection balance from BalanceChangedEvent
   */
  async handleBalanceChanged(
    event: BalanceChangedEvent,
  ): Promise<AccountProjection> {
    this.logger.log(`Updating balance for account: ${event.aggregateId}`);

    const projection = await this.projectionRepository.findOne({
      where: { id: event.aggregateId },
    });

    if (!projection) {
      this.logger.error(
        `Projection not found for account: ${event.aggregateId}`,
      );
      throw new Error(`Projection not found for account: ${event.aggregateId}`);
    }

    // Idempotency check: Only apply if this event hasn't been processed yet
    if (projection.aggregateVersion >= event.aggregateVersion) {
      this.logger.warn(
        `Skipping BalanceChanged event (already processed): ${event.eventId}`,
      );
      return projection;
    }

    projection.balance = event.newBalance;
    projection.aggregateVersion = event.aggregateVersion;
    projection.lastEventId = event.eventId;
    projection.lastEventTimestamp = event.timestamp;

    const updated = await this.projectionRepository.save(projection);

    this.logger.log(
      `✅ Balance updated for account: ${event.aggregateId} (${event.newBalance})`,
    );

    return updated;
  }

  /**
   * Updates projection status from AccountStatusChangedEvent
   */
  async handleAccountStatusChanged(
    event: AccountStatusChangedEvent,
  ): Promise<AccountProjection> {
    this.logger.log(`Updating status for account: ${event.aggregateId}`);

    const projection = await this.projectionRepository.findOne({
      where: { id: event.aggregateId },
    });

    if (!projection) {
      this.logger.error(
        `Projection not found for account: ${event.aggregateId}`,
      );
      throw new Error(`Projection not found for account: ${event.aggregateId}`);
    }

    // Idempotency check
    if (projection.aggregateVersion >= event.aggregateVersion) {
      this.logger.warn(
        `Skipping AccountStatusChanged event (already processed): ${event.eventId}`,
      );
      return projection;
    }

    projection.status = event.newStatus;
    projection.aggregateVersion = event.aggregateVersion;
    projection.lastEventId = event.eventId;
    projection.lastEventTimestamp = event.timestamp;

    const updated = await this.projectionRepository.save(projection);

    this.logger.log(
      `✅ Status updated for account: ${event.aggregateId} (${event.newStatus})`,
    );

    return updated;
  }

  /**
   * Updates projection limits from AccountLimitsChangedEvent
   */
  async handleAccountLimitsChanged(
    event: AccountLimitsChangedEvent,
  ): Promise<AccountProjection> {
    this.logger.log(`Updating limits for account: ${event.aggregateId}`);

    const projection = await this.projectionRepository.findOne({
      where: { id: event.aggregateId },
    });

    if (!projection) {
      this.logger.error(
        `Projection not found for account: ${event.aggregateId}`,
      );
      throw new Error(`Projection not found for account: ${event.aggregateId}`);
    }

    // Idempotency check
    if (projection.aggregateVersion >= event.aggregateVersion) {
      this.logger.warn(
        `Skipping AccountLimitsChanged event (already processed): ${event.eventId}`,
      );
      return projection;
    }

    if (event.newMaxBalance !== undefined) {
      projection.maxBalance = event.newMaxBalance;
    }
    if (event.newMinBalance !== undefined) {
      projection.minBalance = event.newMinBalance;
    }

    projection.aggregateVersion = event.aggregateVersion;
    projection.lastEventId = event.eventId;
    projection.lastEventTimestamp = event.timestamp;

    const updated = await this.projectionRepository.save(projection);

    this.logger.log(`✅ Limits updated for account: ${event.aggregateId}`);

    return updated;
  }

  /**
   * Finds a projection by account ID (for queries)
   */
  async findById(accountId: AccountId): Promise<AccountProjection | null> {
    return this.projectionRepository.findOne({ where: { id: accountId } });
  }

  /**
   * Finds all projections by owner ID
   */
  async findByOwnerId(ownerId: OwnerId): Promise<AccountProjection[]> {
    return this.projectionRepository.find({ where: { ownerId } });
  }

  /**
   * Finds all projections (with pagination)
   */
  async findAll(
    limit: number = 100,
    offset: number = 0,
  ): Promise<AccountProjection[]> {
    return this.projectionRepository.find({
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });
  }
}
