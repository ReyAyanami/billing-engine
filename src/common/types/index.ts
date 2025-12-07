export interface OperationContext {
  correlationId: string;
  actorId?: string;
  actorType?: string;
  timestamp: Date;
}

export interface TransactionResult {
  transactionId: string;
  idempotencyKey: string;
  type: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  sourceBalanceBefore: string;
  sourceBalanceAfter: string;
  destinationBalanceBefore: string;
  destinationBalanceAfter: string;
  status: string;
  reference?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface TransferResult {
  debitTransactionId: string;
  creditTransactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  status: string;
  reference?: string;
  createdAt: Date;
  completedAt?: Date | null;
}

