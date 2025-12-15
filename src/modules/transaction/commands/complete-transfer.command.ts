import { Command } from '../../../cqrs/base/command';

/**
 * Command to complete a transfer transaction.
 * Called after both source and destination accounts have been successfully updated.
 */
export class CompleteTransferCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly sourceNewBalance: string,
    public readonly destinationNewBalance: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
