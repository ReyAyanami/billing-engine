import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { EventStream } from '../events/event-stream.types';

/**
 * Outbox processing status
 */
export enum OutboxStatus {
  /** Event is pending delivery */
  PENDING = 'pending',

  /** Event is currently being processed */
  PROCESSING = 'processing',

  /** Event was successfully delivered */
  DELIVERED = 'delivered',

  /** Event delivery failed after retries */
  FAILED = 'failed',
}

/**
 * Outbox Pattern Entity
 *
 * Ensures reliable event delivery using the Transactional Outbox pattern.
 *
 * How it works:
 * 1. Domain events are saved to this table in the same transaction as the aggregate
 * 2. Background worker polls for pending events
 * 3. Worker publishes events to event bus/Kafka
 * 4. Worker marks events as delivered
 *
 * Benefits:
 * - Guarantees at-least-once delivery
 * - Survives application crashes
 * - No event loss
 * - Can replay failed events
 */
@Entity('outbox_events')
@Index(['status', 'createdAt'])
@Index(['aggregateType', 'aggregateId'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Event metadata
   */
  @Column({ length: 100 })
  @Index()
  eventType!: string;

  @Column({ length: 36 })
  eventId!: string;

  @Column({ length: 50 })
  aggregateType!: string;

  @Column({ length: 36 })
  aggregateId!: string;

  @Column()
  aggregateVersion!: number;

  /**
   * Event payload (full event data as JSON)
   */
  @Column('jsonb')
  payload!: {
    eventId: string;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    timestamp: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown; // Event-specific data
  };

  /**
   * Target streams for this event
   */
  @Column('simple-array')
  targetStreams!: EventStream[];

  /**
   * Processing status
   */
  @Column({
    type: 'enum',
    enum: OutboxStatus,
    default: OutboxStatus.PENDING,
  })
  @Index()
  status!: OutboxStatus;

  /**
   * Retry tracking
   */
  @Column({ default: 0 })
  retryCount!: number;

  @Column({ nullable: true })
  lastRetryAt?: Date;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @Column({ default: 3 })
  maxRetries!: number;

  /**
   * Error tracking
   */
  @Column('text', { nullable: true })
  lastError?: string;

  @Column('jsonb', { nullable: true })
  errorHistory?: Array<{
    timestamp: string;
    error: string;
    retryCount: number;
  }>;

  /**
   * Delivery tracking
   */
  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Priority for processing (higher = more urgent)
   */
  @Column({ default: 0 })
  priority!: number;
}
