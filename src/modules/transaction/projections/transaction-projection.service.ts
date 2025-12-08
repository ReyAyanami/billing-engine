import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionProjection } from './transaction-projection.entity';
import { TransactionType, TransactionStatus } from '../transaction.entity';

/**
 * Service for managing transaction projections (read model).
 * Provides methods to create, update, and query transaction projections.
 */
@Injectable()
export class TransactionProjectionService {
  private readonly logger = new Logger(TransactionProjectionService.name);

  constructor(
    @InjectRepository(TransactionProjection)
    private readonly projectionRepository: Repository<TransactionProjection>,
  ) {}

  /**
   * Create a new transaction projection when transaction is requested
   */
  async createTransactionProjection(data: {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: string;
    currency: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    idempotencyKey: string;
    correlationId?: string;
    requestedAt: Date;
    aggregateVersion: number;
    lastEventId: string;
    lastEventTimestamp: Date;
    metadata?: Record<string, any>;
  }): Promise<TransactionProjection> {
    const projection = this.projectionRepository.create({
      id: data.id,
      type: data.type,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      sourceAccountId: data.sourceAccountId,
      destinationAccountId: data.destinationAccountId,
      idempotencyKey: data.idempotencyKey,
      correlationId: data.correlationId,
      requestedAt: data.requestedAt,
      aggregateVersion: data.aggregateVersion,
      lastEventId: data.lastEventId,
      lastEventTimestamp: data.lastEventTimestamp,
      metadata: data.metadata,
    });
    return this.projectionRepository.save(projection);
  }

  /**
   * Update transaction projection when it completes
   */
  async updateTransactionCompleted(
    id: string,
    sourceNewBalance: string | undefined,
    destinationNewBalance: string | undefined,
    completedAt: Date,
    expectedVersion: number,
    lastEventId: string,
    lastEventTimestamp: Date,
  ): Promise<void> {
    await this.projectionRepository
      .createQueryBuilder()
      .update(TransactionProjection)
      .set({
        status: TransactionStatus.COMPLETED,
        sourceNewBalance,
        destinationNewBalance,
        completedAt,
        updatedAt: lastEventTimestamp,
        aggregateVersion: expectedVersion,
        lastEventId,
        lastEventTimestamp,
      })
      .where('id = :id AND aggregateVersion < :expectedVersion', {
        id,
        expectedVersion,
      })
      .execute();
  }

  /**
   * Update transaction projection when it fails
   */
  async updateTransactionFailed(
    id: string,
    reason: string,
    errorCode: string,
    expectedVersion: number,
    lastEventId: string,
    lastEventTimestamp: Date,
  ): Promise<void> {
    await this.projectionRepository
      .createQueryBuilder()
      .update(TransactionProjection)
      .set({
        status: TransactionStatus.FAILED,
        failureReason: reason,
        failureCode: errorCode,
        updatedAt: lastEventTimestamp,
        aggregateVersion: expectedVersion,
        lastEventId,
        lastEventTimestamp,
      })
      .where('id = :id AND aggregateVersion < :expectedVersion', {
        id,
        expectedVersion,
      })
      .execute();
  }

  /**
   * Update transaction projection when it is compensated (rolled back)
   */
  async updateTransactionCompensated(
    id: string,
    reason: string,
    compensationActions: Array<{
      accountId: string;
      action: 'CREDIT' | 'DEBIT';
      amount: string;
      reason: string;
    }>,
    compensatedAt: Date,
    expectedVersion: number,
    lastEventId: string,
    lastEventTimestamp: Date,
  ): Promise<void> {
    await this.projectionRepository
      .createQueryBuilder()
      .update(TransactionProjection)
      .set({
        status: TransactionStatus.COMPENSATED,
        compensationReason: reason,
        compensationActions,
        compensatedAt,
        updatedAt: lastEventTimestamp,
        aggregateVersion: expectedVersion,
        lastEventId,
        lastEventTimestamp,
      })
      .where('id = :id AND aggregateVersion < :expectedVersion', {
        id,
        expectedVersion,
      })
      .execute();
  }

  /**
   * Find transaction by ID
   */
  async findById(id: string): Promise<TransactionProjection | null> {
    return this.projectionRepository.findOne({ where: { id } });
  }

  /**
   * Find transactions by account (source or destination)
   */
  async findByAccount(accountId: string): Promise<TransactionProjection[]> {
    return this.projectionRepository
      .createQueryBuilder('t')
      .where(
        't.sourceAccountId = :accountId OR t.destinationAccountId = :accountId',
        {
          accountId,
        },
      )
      .orderBy('t.requestedAt', 'DESC')
      .getMany();
  }

  /**
   * Find transactions by status
   */
  async findByStatus(
    status: TransactionStatus,
  ): Promise<TransactionProjection[]> {
    return this.projectionRepository.find({
      where: { status },
      order: { requestedAt: 'DESC' },
    });
  }

  /**
   * Find transaction by idempotency key
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<TransactionProjection | null> {
    return this.projectionRepository.findOne({ where: { idempotencyKey } });
  }

  /**
   * Find transactions by correlation ID
   */
  async findByCorrelationId(
    correlationId: string,
  ): Promise<TransactionProjection[]> {
    return this.projectionRepository.find({
      where: { correlationId },
      order: { requestedAt: 'DESC' },
    });
  }
}
