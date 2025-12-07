import { Command } from '../../../cqrs/base/command';

/**
 * Command to update an account's balance.
 * Used by transaction saga to apply balance changes.
 */
export class UpdateBalanceCommand extends Command {
  constructor(
    public readonly accountId: string,
    public readonly changeAmount: string,
    public readonly changeType: 'CREDIT' | 'DEBIT',
    public readonly reason: string,
    public readonly transactionId: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

