import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Saga execution states
 */
export enum SagaStatus {
  /** Saga is waiting to start */
  PENDING = 'pending',

  /** Saga is currently executing */
  PROCESSING = 'processing',

  /** Saga completed successfully */
  COMPLETED = 'completed',

  /** Saga encountered an error and is compensating */
  COMPENSATING = 'compensating',

  /** Saga failed after compensation attempts */
  FAILED = 'failed',

  /** Saga was cancelled */
  CANCELLED = 'cancelled',
}

/**
 * Saga state tracking entity
 *
 * Tracks the execution of long-running business processes (sagas).
 * Provides immediate consistency for saga status queries.
 *
 * Key difference from projections:
 * - Saga state: What's the status of this business process?
 * - Projection: What's the current view of this data?
 */
@Entity('saga_states')
export class SagaState {
  @PrimaryColumn({ length: 36 })
  sagaId!: string;

  @Column({ length: 50 })
  sagaType!: string; // 'topup', 'payment', 'withdrawal', etc.

  @Column({
    type: 'enum',
    enum: SagaStatus,
    default: SagaStatus.PENDING,
  })
  status!: SagaStatus;

  /**
   * Saga execution state
   * Tracks progress through saga steps
   */
  @Column('jsonb')
  state!: {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    pendingSteps: string[];
    failedStep?: string;
    compensationActions: Array<{
      action: string;
      timestamp: string;
      result?: string;
    }>;
  };

  /**
   * Saga correlation ID (maps to transaction/aggregate ID)
   */
  @Column({ length: 36 })
  correlationId!: string;

  /**
   * Result of saga execution
   */
  @Column('jsonb', { nullable: true })
  result?: {
    success: boolean;
    data?: unknown;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
  };

  /**
   * Retry tracking
   */
  @Column({ default: 0 })
  retryCount!: number;

  @Column({ nullable: true })
  lastRetryAt?: Date;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @CreateDateColumn()
  startedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  /**
   * Metadata for debugging and monitoring
   */
  @Column('jsonb', { nullable: true })
  metadata?: {
    initiatedBy?: string;
    environment?: string;
    traceId?: string;
    [key: string]: unknown;
  };
}
