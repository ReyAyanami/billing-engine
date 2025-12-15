import { Command } from '../../../cqrs/base/command';

/**
 * Parameters for UpdateBalanceCommand
 */
export interface UpdateBalanceCommandParams {
  accountId: string;
  changeAmount: string;
  changeType: 'CREDIT' | 'DEBIT';
  reason: string;
  transactionId: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to update an account's balance.
 * Used by transaction saga to apply balance changes.
 */
export class UpdateBalanceCommand extends Command {
  public readonly accountId: string;
  public readonly changeAmount: string;
  public readonly changeType: 'CREDIT' | 'DEBIT';
  public readonly reason: string;
  public readonly transactionId: string;

  constructor(params: UpdateBalanceCommandParams) {
    super(params.correlationId, params.actorId);
    this.accountId = params.accountId;
    this.changeAmount = params.changeAmount;
    this.changeType = params.changeType;
    this.reason = params.reason;
    this.transactionId = params.transactionId;
  }
}
