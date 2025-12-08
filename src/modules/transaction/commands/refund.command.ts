import { Command } from '../../../cqrs/base/command';
import { v4 as uuidv4 } from 'uuid';

/**
 * Refund metadata interface
 */
export interface RefundMetadata {
  reason?: string;
  refundType?: 'full' | 'partial';
  notes?: string;
  [key: string]: any;
}

/**
 * Parameters for RefundCommand
 */
export interface RefundCommandParams {
  refundId: string;
  originalPaymentId: string;
  refundAmount: string;
  currency: string;
  idempotencyKey?: string;
  refundMetadata?: RefundMetadata;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to initiate a refund transaction.
 * Refund: Merchant returns money to customer for a previous payment.
 */
export class RefundCommand extends Command {
  public readonly refundId: string;
  public readonly originalPaymentId: string;
  public readonly refundAmount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;
  public readonly refundMetadata?: RefundMetadata;

  constructor(params: RefundCommandParams) {
    super(params.correlationId || uuidv4(), params.actorId);
    this.refundId = params.refundId;
    this.originalPaymentId = params.originalPaymentId;
    this.refundAmount = params.refundAmount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey || uuidv4();
    this.refundMetadata = params.refundMetadata;
  }
}
