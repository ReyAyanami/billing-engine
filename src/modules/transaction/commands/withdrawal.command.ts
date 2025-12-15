import { Command } from '../../../cqrs/base/command';

/**
 * Parameters for WithdrawalCommand
 */
export interface WithdrawalCommandParams {
  transactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  destinationAccountId: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to request a withdrawal transaction.
 * Withdrawal removes funds from a user account to an external destination.
 */
export class WithdrawalCommand extends Command {
  public readonly transactionId: string;
  public readonly accountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly destinationAccountId: string;
  public readonly idempotencyKey: string;

  constructor(params: WithdrawalCommandParams) {
    super(params.correlationId, params.actorId);
    this.transactionId = params.transactionId;
    this.accountId = params.accountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.destinationAccountId = params.destinationAccountId;
    this.idempotencyKey = params.idempotencyKey;
  }
}
