import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { Currency } from '../currency/currency.entity';

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export enum AccountType {
  USER = 'user', // End-user account
  SYSTEM = 'system', // Internal system account
  EXTERNAL = 'external', // External financial service
}

@Entity('accounts')
@Index(['ownerId', 'ownerType'])
@Index(['status'])
@Index(['accountType'])
@Index(['createdAt'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @Column({ name: 'owner_id', length: 255 })
  readonly ownerId!: string;

  @Column({ name: 'owner_type', length: 50 })
  readonly ownerType!: string;

  @Column({
    name: 'account_type',
    type: 'enum',
    enum: AccountType,
    default: AccountType.USER,
  })
  readonly accountType!: AccountType;

  @Column({
    name: 'account_subtype',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: null,
  })
  readonly accountSubtype?: string;

  @Column({ length: 10 })
  readonly currency!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyDetails!: Currency;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance!: string;

  @Column({
    name: 'max_balance',
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    default: null,
  })
  maxBalance?: string;

  @Column({
    name: 'min_balance',
    type: 'decimal',
    precision: 20,
    scale: 8,
    nullable: true,
    default: null,
  })
  minBalance?: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at' })
  readonly createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
