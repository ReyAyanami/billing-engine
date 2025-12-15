import { Command } from '../../../cqrs/base/command';

/**
 * Command to fail a transaction.
 * Called when transaction processing encounters an error.
 */
export class FailTransactionCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly reason: string,
    public readonly errorCode: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
