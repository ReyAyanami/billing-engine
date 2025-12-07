import { Command } from '../../../cqrs/base/command';

/**
 * Command to complete a topup transaction.
 * Called after account balance has been successfully updated.
 */
export class CompleteTopupCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly newBalance: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

