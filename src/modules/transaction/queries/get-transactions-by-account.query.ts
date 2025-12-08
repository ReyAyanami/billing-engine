import { Query } from '../../../cqrs/base/query';
import { AccountId } from '../../../common/types/branded.types';

/**
 * Query to get all transactions for a specific account.
 */
export class GetTransactionsByAccountQuery extends Query {
  public readonly actorId?: string;

  constructor(
    public readonly accountId: AccountId,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId);
    this.actorId = actorId;
  }
}
