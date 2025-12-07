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
  OneToMany,
} from 'typeorm';
import { Currency } from '../currency/currency.entity';
import { Transaction } from '../transaction/transaction.entity';

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

@Entity('accounts')
@Index(['ownerId', 'ownerType'])
@Index(['status'])
@Index(['createdAt'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', length: 255 })
  ownerId: string;

  @Column({ name: 'owner_type', length: 50 })
  ownerType: string;

  @Column({ length: 10 })
  currency: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyDetails: Currency;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];
}

