import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionContext } from './transaction-context';
import { ITransactionStep } from './transaction-step.interface';
import { TransactionResult } from '../../../common/types';

/**
 * Pipeline executor for transaction processing.
 * Runs a series of steps in sequence within a database transaction.
 */
@Injectable()
export class TransactionPipeline {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Execute a transaction pipeline with the given steps.
   * @param context - The transaction context
   * @param steps - Array of steps to execute
   * @returns Promise<TransactionResult>
   */
  async execute(
    context: TransactionContext,
    steps: ITransactionStep[],
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Inject entity manager into context
      context.manager = manager;

      // Execute each step in sequence
      for (const step of steps) {
        await step.execute(context);
      }

      // Map context to result
      return this.mapToResult(context);
    });
  }

  /**
   * Map transaction context to result
   */
  private mapToResult(context: TransactionContext): TransactionResult {
    if (!context.transaction) {
      throw new Error('Transaction not created');
    }

    return {
      transactionId: context.transaction.id,
      idempotencyKey: context.transaction.idempotencyKey,
      type: context.transaction.type,
      sourceAccountId: context.transaction.sourceAccountId,
      destinationAccountId: context.transaction.destinationAccountId,
      amount: context.transaction.amount,
      currency: context.transaction.currency,
      sourceBalanceBefore: context.transaction.sourceBalanceBefore,
      sourceBalanceAfter: context.transaction.sourceBalanceAfter,
      destinationBalanceBefore: context.transaction.destinationBalanceBefore,
      destinationBalanceAfter: context.transaction.destinationBalanceAfter,
      status: context.transaction.status,
      reference: context.transaction.reference,
      metadata: context.transaction.metadata,
      createdAt: context.transaction.createdAt,
    };
  }
}

