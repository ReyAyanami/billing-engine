import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionProjection } from '../projections/transaction-projection.entity';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';
import { TransactionId } from '../../../common/types/branded.types';

/**
 * Service for rebuilding transaction projections from event store.
 * Used for:
 * - Recovering from projection corruption
 * - Fixing projection inconsistencies
 * - Debugging event sourcing issues
 * - Migrating projection schema
 */
@Injectable()
export class TransactionProjectionRebuildService {
  private readonly logger = new Logger(TransactionProjectionRebuildService.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    @InjectRepository(TransactionProjection)
    private projectionRepository: Repository<TransactionProjection>,
  ) {}

  /**
   * Rebuild a single transaction projection from its events
   */
  async rebuildTransaction(transactionId: TransactionId): Promise<TransactionProjection> {
    this.logger.log(`Rebuilding projection for transaction: ${transactionId}`);

    const events = await this.eventStore.getEvents('Transaction', transactionId);

    if (events.length === 0) {
      throw new Error(`No events found for transaction: ${transactionId}`);
    }

    const aggregate = TransactionAggregate.fromEvents(events);
    const lastEvent = events[events.length - 1]!;
    const firstEvent = events[0]!;

    const projection = await this.projectionRepository.findOne({
      where: { id: transactionId },
    });

    const aggregateState: Partial<TransactionProjection> = {
      id: transactionId,
      type: aggregate.getType() as any,
      status: aggregate.getStatus(),
      amount: aggregate.getAmount() || '0',
      currency: aggregate.getCurrency(),
      sourceAccountId: aggregate.getSourceAccountId() || undefined,
      destinationAccountId: aggregate.getDestinationAccountId() || undefined,
      sourceSignedAmount: undefined,
      destinationSignedAmount: undefined,
      sourceNewBalance: aggregate.getSourceNewBalance() || undefined,
      destinationNewBalance: aggregate.getDestinationNewBalance() || undefined,
      idempotencyKey: aggregate.getIdempotencyKey(),
      correlationId: undefined,
      failureReason: aggregate.getFailureReason() || undefined,
      failureCode: aggregate.getFailureCode() || undefined,
      compensationReason: aggregate.getCompensationReason() || undefined,
      compensationActions: aggregate.getCompensationActions() as any || undefined,
      requestedAt: aggregate.getRequestedAt() || firstEvent.timestamp,
      completedAt: aggregate.getCompletedAt() || undefined,
      compensatedAt: aggregate.getCompensatedAt() || undefined,
      aggregateVersion: aggregate.getVersion(),
      lastEventId: lastEvent.eventId,
      lastEventTimestamp: lastEvent.timestamp,
      metadata: {},
    };

    if (projection) {
      Object.assign(projection, aggregateState);
      await this.projectionRepository.save(projection);
      this.logger.log(`✅ Transaction projection rebuilt: ${transactionId}`);
    } else {
      const newProjection = this.projectionRepository.create(aggregateState);
      await this.projectionRepository.save(newProjection);
      this.logger.log(`✅ Transaction projection created: ${transactionId}`);
    }

    return await this.projectionRepository.findOne({
      where: { id: transactionId },
    }) as TransactionProjection;
  }

  /**
   * Rebuild all transaction projections (use with caution)
   */
  async rebuildAllTransactions(): Promise<{
    total: number;
    successful: number;
    failed: string[];
  }> {
    this.logger.warn('Starting rebuild of ALL transaction projections...');

    const allProjections = await this.projectionRepository.find();
    const results = {
      total: allProjections.length,
      successful: 0,
      failed: [] as string[],
    };

    for (const projection of allProjections) {
      try {
        await this.rebuildTransaction(projection.id as TransactionId);
        results.successful++;
      } catch (error) {
        this.logger.error(
          `Failed to rebuild transaction ${projection.id}`,
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

