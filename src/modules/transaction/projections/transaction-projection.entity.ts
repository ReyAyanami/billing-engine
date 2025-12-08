import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TransactionType, TransactionStatus } from '../transaction.entity';

/**
 * Transaction Projection (Read Model)
 *
 * Denormalized view of transaction data optimized for fast queries.
 * Updated by event handlers when transaction events occur.
 */
@Entity('transaction_projections')
export class TransactionProjection {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType })
  @Index()
  type: TransactionType;

  @Column({ type: 'enum', enum: TransactionStatus })
  @Index()
  status: TransactionStatus;

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount: string;

  @Column({ length: 3 })
  currency: string;

  @Column({ name: 'source_account_id', type: 'uuid', nullable: true })
  @Index()
  sourceAccountId?: string;

  @Column({ name: 'destination_account_id', type: 'uuid', nullable: true })
  @Index()
  destinationAccountId?: string;

  @Column({ name: 'idempotency_key', length: 255, unique: true })
  @Index()
  idempotencyKey: string;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  @Index()
  correlationId?: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @Column({ name: 'failure_code', length: 100, nullable: true })
  failureCode?: string;

  @Column({
    name: 'source_new_balance',
    type: 'numeric',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  sourceNewBalance?: string;

  @Column({
    name: 'destination_new_balance',
    type: 'numeric',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  destinationNewBalance?: string;

  @CreateDateColumn({ name: 'requested_at' })
  @Index()
  requestedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'compensated_at', type: 'timestamp', nullable: true })
  compensatedAt?: Date;

  @Column({ name: 'compensation_reason', type: 'text', nullable: true })
  compensationReason?: string;

  @Column({ name: 'compensation_actions', type: 'jsonb', nullable: true })
  compensationActions?: Array<{
    accountId: string;
    action: 'CREDIT' | 'DEBIT';
    amount: string;
    reason: string;
  }>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'aggregate_version', type: 'int', default: 0 })
  aggregateVersion: number;

  @Column({ name: 'last_event_id', type: 'uuid', nullable: true })
  lastEventId?: string;

  @Column({ name: 'last_event_timestamp', type: 'timestamp', nullable: true })
  lastEventTimestamp?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
