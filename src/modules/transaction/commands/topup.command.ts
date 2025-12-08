import { Command } from '../../../cqrs/base/command';

/**
 * Parameters for TopupCommand
 */
export interface TopupCommandParams {
  transactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  sourceAccountId: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to request a topup transaction.
 * Topup adds funds from an external source to a user account.
 */
export class TopupCommand extends Command {
  public readonly transactionId: string;
  public readonly accountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly sourceAccountId: string;
  public readonly idempotencyKey: string;

  constructor(params: TopupCommandParams) {
    super(params.correlationId, params.actorId);
    this.transactionId = params.transactionId;
    this.accountId = params.accountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.sourceAccountId = params.sourceAccountId;
    this.idempotencyKey = params.idempotencyKey;
  }
}
