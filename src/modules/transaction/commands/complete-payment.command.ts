import { Command } from '../../../cqrs/base/command';

/**
 * Command to complete a payment transaction.
 * Called after both customer and merchant accounts have been successfully updated.
 */
export class CompletePaymentCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly customerNewBalance: string,
    public readonly merchantNewBalance: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
