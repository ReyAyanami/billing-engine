import { Command } from '../../../cqrs/base/command';
import { AccountType } from '../account.entity';

/**
 * Command to create a new account.
 * This represents the intention to create an account in the system.
 */
export class CreateAccountCommand extends Command {
  constructor(
    public readonly accountId: string,
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly accountType: AccountType,
    public readonly currency: string,
    public readonly maxBalance?: string,
    public readonly minBalance?: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
