import { Command } from '../../../cqrs/base/command';

/**
 * Parameters for TransferCommand
 */
export interface TransferCommandParams {
  transactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to request a transfer transaction.
 * Transfer moves funds between two user accounts within the system.
 */
export class TransferCommand extends Command {
  public readonly transactionId: string;
  public readonly sourceAccountId: string;
  public readonly destinationAccountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;

  constructor(params: TransferCommandParams) {
    super(params.correlationId, params.actorId);
    this.transactionId = params.transactionId;
    this.sourceAccountId = params.sourceAccountId;
    this.destinationAccountId = params.destinationAccountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey;
  }
}
