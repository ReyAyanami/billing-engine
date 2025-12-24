import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionProjection } from '../projections/transaction-projection.entity';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';
import { TransactionId } from '../../../common/types/branded.types';
import { TransactionStatus } from '../transaction.types';

export interface TransactionReconciliationResult {
  transactionId: string;
  match: boolean;
  projectionStatus: string;
  eventSourceStatus: string;
  projectionVersion: number;
  eventSourceVersion: number;
  versionMismatch: boolean;
  issues: string[];
}

/**
 * Service for reconciling transaction projections with event-sourced state.
 * Detects inconsistencies and helps maintain data integrity.
 */
@Injectable()
export class TransactionReconciliationService {
  private readonly logger = new Logger(TransactionReconciliationService.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    @InjectRepository(TransactionProjection)
    private projectionRepository: Repository<TransactionProjection>,
  ) {}

  /**
   * Reconcile a single transaction projection with its event-sourced state
   */
  async reconcileTransaction(
    transactionId: TransactionId,
  ): Promise<TransactionReconciliationResult> {
    this.logger.log(`Reconciling transaction: ${transactionId}`);

    const projection = await this.projectionRepository.findOne({
      where: { id: transactionId },
    });

    if (!projection) {
      throw new Error(`Projection not found for transaction: ${transactionId}`);
    }

    const events = await this.eventStore.getEvents(
      'Transaction',
      transactionId,
    );

    if (events.length === 0) {
      throw new Error(`No events found for transaction: ${transactionId}`);
    }

    const aggregate = TransactionAggregate.fromEvents(events);

    const versionMismatch =
      projection.aggregateVersion !== aggregate.getVersion();
    const statusMatch = projection.status === aggregate.getStatus();

    const issues: string[] = [];

    if (!statusMatch) {
      issues.push(
        `Status mismatch: projection=${projection.status}, events=${aggregate.getStatus()}`,
      );
    }

    if (versionMismatch) {
      issues.push(
        `Version mismatch: projection at v${projection.aggregateVersion}, events at v${aggregate.getVersion()}`,
      );
    }

    if (projection.type !== (aggregate.getType() as any)) {
      issues.push(
        `Type mismatch: projection=${projection.type}, events=${aggregate.getType()}`,
      );
    }

    if (projection.amount !== aggregate.getAmount()?.toString()) {
      issues.push(
        `Amount mismatch: projection=${projection.amount}, events=${aggregate.getAmount()?.toString()}`,
      );
    }

    const result: TransactionReconciliationResult = {
      transactionId,
      match: statusMatch && !versionMismatch && issues.length === 0,
      projectionStatus: projection.status,
      eventSourceStatus: aggregate.getStatus(),
      projectionVersion: projection.aggregateVersion,
      eventSourceVersion: aggregate.getVersion(),
      versionMismatch,
      issues,
    };

    if (!result.match) {
      this.logger.warn(
        `❌ Reconciliation failed for transaction ${transactionId}:\n${issues.join('\n')}`,
      );
    } else {
      this.logger.log(
        `✅ Transaction ${transactionId} reconciliation successful`,
      );
    }

    return result;
  }

  /**
   * Find stuck transactions (pending for too long)
   */
  async findStuckTransactions(
    olderThanMinutes: number = 5,
  ): Promise<TransactionProjection[]> {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const stuckTransactions = await this.projectionRepository
      .createQueryBuilder('t')
      .where('t.status = :status', { status: TransactionStatus.PENDING })
      .andWhere('t.requestedAt < :cutoff', { cutoff: cutoffTime })
      .getMany();

    if (stuckTransactions.length > 0) {
      this.logger.warn(
        `⚠️  Found ${stuckTransactions.length} stuck transactions (pending > ${olderThanMinutes}m)`,
      );
    }

    return stuckTransactions;
  }

  /**
   * Reconcile all transactions
   */
  async reconcileAllTransactions(): Promise<{
    total: number;
    matches: number;
    mismatches: number;
    results: TransactionReconciliationResult[];
  }> {
    this.logger.log('Starting reconciliation of all transactions...');

    const allProjections = await this.projectionRepository.find();
    const results: TransactionReconciliationResult[] = [];

    for (const projection of allProjections) {
      try {
        const result = await this.reconcileTransaction(
          projection.id as TransactionId,
        );
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to reconcile transaction ${projection.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        results.push({
          transactionId: projection.id,
          match: false,
          projectionStatus: projection.status,
          eventSourceStatus: 'ERROR',
          projectionVersion: projection.aggregateVersion,
          eventSourceVersion: -1,
          versionMismatch: true,
          issues: [
            `Reconciliation error: ${error instanceof Error ? error.message : String(error)}`,
          ],
        });
      }
    }

    const summary = {
      total: results.length,
      matches: results.filter((r) => r.match).length,
      mismatches: results.filter((r) => !r.match).length,
      results: results.filter((r) => !r.match),
    };

    this.logger.log(
      `✅ Reconciliation complete: ${summary.matches}/${summary.total} match`,
    );

    if (summary.mismatches > 0) {
      this.logger.warn(`⚠️  Found ${summary.mismatches} mismatches!`);
    }

    return summary;
  }
}
