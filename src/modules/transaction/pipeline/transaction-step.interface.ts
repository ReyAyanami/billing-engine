import { TransactionContext } from './transaction-context';

/**
 * Interface for transaction pipeline steps.
 * Each step processes the context and can modify it.
 */
export interface ITransactionStep {
  /**
   * Execute this step of the transaction pipeline.
   * @param context - The transaction context
   * @returns Promise that resolves when step is complete
   * @throws Error if step fails
   */
  execute(context: TransactionContext): Promise<void>;
}

/**
 * Base class for transaction steps with helper methods.
 */
export abstract class TransactionStep implements ITransactionStep {
  abstract execute(context: TransactionContext): Promise<void>;

  /**
   * Helper to ensure a value exists, throw if not.
   */
  protected ensure<T>(value: T | undefined | null, errorMessage: string): T {
    if (value === undefined || value === null) {
      throw new Error(errorMessage);
    }
    return value;
  }
}

