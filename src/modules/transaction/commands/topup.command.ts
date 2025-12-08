import { Command } from '../../../cqrs/base/command';

/**
 * Command to request a topup transaction.
 * Topup adds funds from an external source to a user account.
 */
export class TopupCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly accountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly sourceAccountId: string, // External/system account
    public readonly idempotencyKey: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
