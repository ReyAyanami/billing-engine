import { Query } from '../../../cqrs/base/query';

/**
 * Query to get a single transaction by ID.
 */
export class GetTransactionQuery extends Query {
  constructor(
    public readonly transactionId: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

