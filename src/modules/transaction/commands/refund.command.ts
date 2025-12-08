import { Command } from '../../../cqrs/base/command';
import { v4 as uuidv4 } from 'uuid';

/**
 * Command to initiate a refund transaction.
 * Refund: Merchant returns money to customer for a previous payment.
 */
export class RefundCommand extends Command {
  constructor(
    public readonly refundId: string,
    public readonly originalPaymentId: string,
    public readonly refundAmount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string = uuidv4(),
    public readonly refundMetadata?: {
      reason?: string;
      refundType?: 'full' | 'partial';
      notes?: string;
      [key: string]: any;
    },
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId || uuidv4(), actorId);
  }
}
