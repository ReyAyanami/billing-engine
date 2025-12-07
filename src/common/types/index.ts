export interface OperationContext {
  correlationId: string;
  actorId?: string;
  actorType?: string;
  timestamp: Date;
}

export interface TransactionResult {
  transactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  balanceAfter: string;
  status: string;
  createdAt: Date;
}

export interface TransferResult {
  debitTransactionId: string;
  creditTransactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  sourceBalanceAfter: string;
  destinationBalanceAfter: string;
  status: string;
  createdAt: Date;
}

