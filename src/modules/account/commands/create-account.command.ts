import { Command } from '../../../cqrs/base/command';
import { AccountType } from '../account.entity';

/**
 * Parameters for CreateAccountCommand
 */
export interface CreateAccountCommandParams {
  accountId: string;
  ownerId: string;
  ownerType: string;
  accountType: AccountType;
  currency: string;
  maxBalance?: string;
  minBalance?: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to create a new account.
 * This represents the intention to create an account in the system.
 */
export class CreateAccountCommand extends Command {
  public readonly accountId: string;
  public readonly ownerId: string;
  public readonly ownerType: string;
  public readonly accountType: AccountType;
  public readonly currency: string;
  public readonly maxBalance?: string;
  public readonly minBalance?: string;

  constructor(params: CreateAccountCommandParams) {
    super(params.correlationId, params.actorId);
    this.accountId = params.accountId;
    this.ownerId = params.ownerId;
    this.ownerType = params.ownerType;
    this.accountType = params.accountType;
    this.currency = params.currency;
    this.maxBalance = params.maxBalance;
    this.minBalance = params.minBalance;
  }
}
