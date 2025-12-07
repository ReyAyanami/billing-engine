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
}

@Entity('transactions')
@Index(['accountId', 'createdAt'])
@Index(['idempotencyKey'], { unique: true })
@Index(['status'])
@Index(['createdAt'])
@Index(['parentTransactionId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'uuid', unique: true })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, (account) => account.transactions, { 
    onDelete: 'RESTRICT', 
    onUpdate: 'CASCADE' 
  })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'counterparty_account_id', type: 'uuid', nullable: true })
  counterpartyAccountId: string | null;

  @ManyToOne(() => Account, { 
    nullable: true, 
    onDelete: 'RESTRICT', 
    onUpdate: 'CASCADE' 
  })
  @JoinColumn({ name: 'counterparty_account_id' })
  counterpartyAccount: Account | null;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: string;

  @Column({ length: 10 })
  currency: string;

  @Column({ name: 'balance_before', type: 'decimal', precision: 20, scale: 8 })
  balanceBefore: string;

  @Column({ name: 'balance_after', type: 'decimal', precision: 20, scale: 8 })
  balanceAfter: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ length: 500, nullable: true })
  reference: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'parent_transaction_id', type: 'uuid', nullable: true })
  parentTransactionId: string | null;

  @ManyToOne(() => Transaction, { 
    nullable: true, 
    onDelete: 'RESTRICT', 
    onUpdate: 'CASCADE' 
  })
  @JoinColumn({ name: 'parent_transaction_id' })
  parentTransaction: Transaction | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}

