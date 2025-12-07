import { EntityManager } from 'typeorm';
import { Account } from '../../account/account.entity';
import { Transaction, TransactionType } from '../transaction.entity';
import { OperationContext } from '../../../common/types';
import Decimal from 'decimal.js';

/**
 * Context object that holds all data needed during transaction processing.
 * This is passed through the pipeline and modified by each step.
 */
export class TransactionContext {
  // Input data
  idempotencyKey: string;
  type: TransactionType;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  reference?: string;
  metadata?: Record<string, any>;
  parentTransactionId?: string;
  operationContext: OperationContext;

  // Database
  manager: EntityManager;

  // Loaded entities
  sourceAccount?: Account;
  destinationAccount?: Account;
  transaction?: Transaction;
  linkedTransaction?: Transaction; // For transfer credit/debit linking

  // Calculated values
  amountDecimal?: Decimal;
  sourceBalanceBefore?: Decimal;
  sourceBalanceAfter?: Decimal;
  destinationBalanceBefore?: Decimal;
  destinationBalanceAfter?: Decimal;

  // Validation flags
  skipSourceBalanceCheck?: boolean;
  skipDestinationBalanceCheck?: boolean;

  constructor(data: Partial<TransactionContext>) {
    Object.assign(this, data);
  }
}

