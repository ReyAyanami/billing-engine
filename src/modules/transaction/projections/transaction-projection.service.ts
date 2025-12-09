import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionProjection } from './transaction-projection.entity';
import { TransactionType, TransactionStatus } from '../transaction.types';
import { TransactionId, AccountId } from '../../../common/types/branded.types';

/**
 * Service for managing transaction projections (read model).
 * Provides methods to create, update, and query transaction projections.
 */
@Injectable()
export class TransactionProjectionService {
  // Logger available for future use
  // private readonly logger = new Logger(TransactionProjectionService.name);

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
    sourceSignedAmount?: string;
    destinationSignedAmount?: string;
    idempotencyKey: string;
    correlationId?: string;
    requestedAt: Date;
    aggregateVersion: number;
    lastEventId: string;
    lastEventTimestamp: Date;
    metadata?: Record<string, unknown>;
  }): Promise<TransactionProjection> {
    const projection = this.projectionRepository.create({
      id: data.id,
      type: data.type,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      sourceAccountId: data.sourceAccountId,
      destinationAccountId: data.destinationAccountId,
      sourceSignedAmount: data.sourceSignedAmount,
      destinationSignedAmount: data.destinationSignedAmount,
      idempotencyKey: data.idempotencyKey,
      correlationId: data.correlationId,
      requestedAt: data.requestedAt,
      aggregateVersion: data.aggregateVersion,
      lastEventId: data.lastEventId,
      lastEventTimestamp: data.lastEventTimestamp,
      metadata: data.metadata as Record<string, string | number | boolean>,
    });
    return await this.projectionRepository.save(projection);
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
  async findById(id: TransactionId): Promise<TransactionProjection | null> {
    return this.projectionRepository.findOne({ where: { id } });
  }

  /**
   * Find transactions by account (source or destination)
   */
  async findByAccount(accountId: AccountId): Promise<TransactionProjection[]> {
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

  /**
   * Complex filtering for transactions with multiple criteria
   */
  async findWithFilters(filters: {
    accountId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    currency?: string;
    minAmount?: string;
    maxAmount?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TransactionProjection[]> {
    const query = this.projectionRepository.createQueryBuilder('t');

    // Filter by account (source or destination)
    if (filters.accountId) {
      query.andWhere(
        '(t.sourceAccountId = :accountId OR t.destinationAccountId = :accountId)',
        { accountId: filters.accountId },
      );
    }

    // Filter by transaction type
    if (filters.type) {
      query.andWhere('t.type = :type', { type: filters.type });
    }

    // Filter by status
    if (filters.status) {
      query.andWhere('t.status = :status', { status: filters.status });
    }

    // Filter by currency
    if (filters.currency) {
      query.andWhere('t.currency = :currency', { currency: filters.currency });
    }

    // Filter by amount range
    if (filters.minAmount) {
      query.andWhere('CAST(t.amount AS DECIMAL) >= :minAmount', {
        minAmount: parseFloat(filters.minAmount),
      });
    }
    if (filters.maxAmount) {
      query.andWhere('CAST(t.amount AS DECIMAL) <= :maxAmount', {
        maxAmount: parseFloat(filters.maxAmount),
      });
    }

    // Filter by date range
    if (filters.startDate) {
      query.andWhere('t.requestedAt >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('t.requestedAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Pagination
    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    // Order by most recent first
    query.orderBy('t.requestedAt', 'DESC');

    return query.getMany();
  }

  /**
   * Count transactions matching filters
   */
  async countWithFilters(filters: {
    accountId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    currency?: string;
    minAmount?: string;
    maxAmount?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<number> {
    const query = this.projectionRepository.createQueryBuilder('t');

    // Apply same filters as findWithFilters
    if (filters.accountId) {
      query.andWhere(
        '(t.sourceAccountId = :accountId OR t.destinationAccountId = :accountId)',
        { accountId: filters.accountId },
      );
    }
    if (filters.type) {
      query.andWhere('t.type = :type', { type: filters.type });
    }
    if (filters.status) {
      query.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters.currency) {
      query.andWhere('t.currency = :currency', { currency: filters.currency });
    }
    if (filters.minAmount) {
      query.andWhere('CAST(t.amount AS DECIMAL) >= :minAmount', {
        minAmount: parseFloat(filters.minAmount),
      });
    }
    if (filters.maxAmount) {
      query.andWhere('CAST(t.amount AS DECIMAL) <= :maxAmount', {
        maxAmount: parseFloat(filters.maxAmount),
      });
    }
    if (filters.startDate) {
      query.andWhere('t.requestedAt >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      query.andWhere('t.requestedAt <= :endDate', {
        endDate: filters.endDate,
      });
    }

    return query.getCount();
  }

  /**
   * Get transaction statistics for an account
   */
  async getAccountStatistics(accountId: string): Promise<{
    totalTransactions: number;
    completedTransactions: number;
    failedTransactions: number;
    totalVolume: string;
    averageAmount: string;
  }> {
    const result = await this.projectionRepository
      .createQueryBuilder('t')
      .select('COUNT(*)', 'totalTransactions')
      .addSelect(
        "COUNT(CASE WHEN t.status = 'completed' THEN 1 END)",
        'completedTransactions',
      )
      .addSelect(
        "COUNT(CASE WHEN t.status = 'failed' THEN 1 END)",
        'failedTransactions',
      )
      .addSelect('COALESCE(SUM(CAST(t.amount AS DECIMAL)), 0)', 'totalVolume')
      .addSelect('COALESCE(AVG(CAST(t.amount AS DECIMAL)), 0)', 'averageAmount')
      .where(
        't.sourceAccountId = :accountId OR t.destinationAccountId = :accountId',
        { accountId },
      )
      .getRawOne();

    return {
      totalTransactions: parseInt(result.totalTransactions) || 0,
      completedTransactions: parseInt(result.completedTransactions) || 0,
      failedTransactions: parseInt(result.failedTransactions) || 0,
      totalVolume: result.totalVolume?.toString() || '0',
      averageAmount: result.averageAmount?.toString() || '0',
    };
  }
}
