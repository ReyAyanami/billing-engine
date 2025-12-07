import { Command } from '../../../cqrs/base/command';

/**
 * Command to complete a refund transaction.
 * Called after both merchant and customer accounts have been successfully updated.
 */
export class CompleteRefundCommand extends Command {
  constructor(
    public readonly refundId: string,
    public readonly merchantNewBalance: string,
    public readonly customerNewBalance: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

