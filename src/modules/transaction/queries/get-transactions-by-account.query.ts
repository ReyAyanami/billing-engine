import { Query } from '../../../cqrs/base/query';

/**
 * Query to get all transactions for a specific account.
 */
export class GetTransactionsByAccountQuery extends Query {
  constructor(
    public readonly accountId: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

