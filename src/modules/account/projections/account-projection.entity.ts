import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AccountType, AccountStatus } from '../account.types';

/**
 * Account Projection (Read Model)
 *
 * This is the read-optimized version of account data.
 * Updated by event handlers for fast queries without event replay.
 *
 * This is separate from the Account entity (write model) to follow CQRS pattern.
 */
@Entity('account_projections')
@Index(['ownerId'])
@Index(['currency'])
@Index(['status'])
@Index(['accountType'])
export class AccountProjection {
  @PrimaryColumn('uuid')
  readonly id!: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 255 })
  readonly ownerId!: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 50 })
  readonly ownerType!: string;

  @Column({ name: 'account_type', type: 'enum', enum: AccountType })
  readonly accountType!: AccountType;

  @Column({ type: 'varchar', length: 3 })
  readonly currency!: string;

  @Column({ type: 'enum', enum: AccountStatus })
  status!: AccountStatus;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  balance!: string;

  @Column({
    name: 'max_balance',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  maxBalance!: string | null;

  @Column({
    name: 'min_balance',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  minBalance!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Event sourcing metadata
   */
  @Column({ name: 'aggregate_version', type: 'int', default: 0 })
  aggregateVersion!: number;

  @Column({ name: 'last_event_id', type: 'uuid', nullable: true })
  lastEventId!: string | null;

  @Column({ name: 'last_event_timestamp', type: 'timestamp', nullable: true })
  lastEventTimestamp!: Date | null;
}
