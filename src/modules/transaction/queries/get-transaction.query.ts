import { Query } from '../../../cqrs/base/query';
import { TransactionId } from '../../../common/types/branded.types';

/**
 * Query to get a single transaction by ID.
 */
export class GetTransactionQuery extends Query {
  public readonly actorId?: string;

  constructor(
    public readonly transactionId: TransactionId,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId);
    this.actorId = actorId;
  }
}
