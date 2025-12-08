import { Command } from '../../../cqrs/base/command';

/**
 * Command to request a transfer transaction.
 * Transfer moves funds between two user accounts within the system.
 */
export class TransferCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}
