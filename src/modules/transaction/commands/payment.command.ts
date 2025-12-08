import { Command } from '../../../cqrs/base/command';
import { v4 as uuidv4 } from 'uuid';

/**
 * Payment metadata interface
 */
export interface PaymentMetadata {
  orderId?: string;
  invoiceId?: string;
  description?: string;
  merchantReference?: string;
  [key: string]: any;
}

/**
 * Parameters for PaymentCommand
 */
export interface PaymentCommandParams {
  transactionId: string;
  customerAccountId: string;
  merchantAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey?: string;
  paymentMetadata?: PaymentMetadata;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to initiate a payment transaction.
 * Payment: Customer pays merchant for goods/services.
 */
export class PaymentCommand extends Command {
  public readonly transactionId: string;
  public readonly customerAccountId: string;
  public readonly merchantAccountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;
  public readonly paymentMetadata?: PaymentMetadata;

  constructor(params: PaymentCommandParams) {
    super(params.correlationId || uuidv4(), params.actorId);
    this.transactionId = params.transactionId;
    this.customerAccountId = params.customerAccountId;
    this.merchantAccountId = params.merchantAccountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey || uuidv4();
    this.paymentMetadata = params.paymentMetadata;
  }
}
