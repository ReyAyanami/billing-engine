import { Command } from '../../../cqrs/base/command';

/**
 * Command to request a withdrawal transaction.
 * Withdrawal removes funds from a user account to an external destination.
 */
export class WithdrawalCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly accountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly destinationAccountId: string, // External account
    public readonly idempotencyKey: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

