/**
 * Transaction-related enums and types.
 * Separated from entity to support pure event-sourced architecture.
 */

export enum TransactionType {
  TOPUP = 'topup',
  WITHDRAWAL = 'withdrawal',
  TRANSFER_DEBIT = 'transfer_debit',
  TRANSFER_CREDIT = 'transfer_credit',
  PAYMENT = 'payment',
  REFUND = 'refund',
  CANCELLATION = 'cancellation',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  COMPENSATED = 'compensated', // Transaction was rolled back
}
