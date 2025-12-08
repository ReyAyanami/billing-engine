import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Account } from '../account/account.entity';

export enum TransactionType {
  TOPUP = 'topup',
  WITHDRAWAL = 'withdrawal',
  TRANSFER_DEBIT = 'transfer_debit',
  TRANSFER_CREDIT = 'transfer_credit',
  PAYMENT = 'payment',
  REFUND = 'refund',
  CANCELLATION = 'cancellation',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  COMPENSATED = 'compensated', // Transaction was rolled back
}

@Entity('transactions')
@Index(['sourceAccountId', 'createdAt'])
@Index(['destinationAccountId', 'createdAt'])
@Index(['idempotencyKey'], { unique: true })
@Index(['status'])
@Index(['createdAt'])
@Index(['parentTransactionId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'idempotency_key', type: 'uuid', unique: true })
  idempotencyKey!: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type!: TransactionType;

  @Column({ name: 'source_account_id', type: 'uuid' })
  sourceAccountId!: string;

  @ManyToOne(() => Account, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'source_account_id' })
  sourceAccount!: Account;

  @Column({ name: 'destination_account_id', type: 'uuid' })
  destinationAccountId!: string;

  @ManyToOne(() => Account, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'destination_account_id' })
  destinationAccount!: Account;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount!: string;

  @Column({ length: 10 })
  currency!: string;

  @Column({
    name: 'source_balance_before',
    type: 'decimal',
    precision: 20,
    scale: 8,
  })
  sourceBalanceBefore!: string;

  @Column({
    name: 'source_balance_after',
    type: 'decimal',
    precision: 20,
    scale: 8,
  })
  sourceBalanceAfter!: string;

  @Column({
    name: 'destination_balance_before',
    type: 'decimal',
    precision: 20,
    scale: 8,
  })
  destinationBalanceBefore!: string;

  @Column({
    name: 'destination_balance_after',
    type: 'decimal',
    precision: 20,
    scale: 8,
  })
  destinationBalanceAfter!: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({ length: 500, nullable: true })
  reference!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @Column({ name: 'parent_transaction_id', type: 'uuid', nullable: true })
  parentTransactionId!: string | null;

  @ManyToOne(() => Transaction, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_transaction_id' })
  parentTransaction!: Transaction | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;
}
