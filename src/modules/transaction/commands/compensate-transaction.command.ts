import { Command } from '../../../cqrs/base/command';

/**
 * Command to compensate (rollback) a transaction.
 * Used when a saga fails partway through and needs to undo changes.
 */
export class CompensateTransactionCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly reason: string,
    public readonly compensationActions: Array<{
      accountId: string;
      action: 'CREDIT' | 'DEBIT';
      amount: string;
      reason: string;
    }>,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
