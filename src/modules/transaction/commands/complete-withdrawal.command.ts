import { Command } from '../../../cqrs/base/command';

/**
 * Command to complete a withdrawal transaction.
 * Called after account balance has been successfully debited.
 */
export class CompleteWithdrawalCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly newBalance: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

