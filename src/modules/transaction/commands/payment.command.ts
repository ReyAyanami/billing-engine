import { Command } from '../../../cqrs/base/command';
import { v4 as uuidv4 } from 'uuid';

/**
 * Command to initiate a payment transaction.
 * Payment: Customer pays merchant for goods/services.
 */
export class PaymentCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly customerAccountId: string,
    public readonly merchantAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string = uuidv4(),
    public readonly paymentMetadata?: {
      orderId?: string;
      invoiceId?: string;
      description?: string;
      merchantReference?: string;
      [key: string]: any;
    },
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId || uuidv4(), actorId);
  }
}
