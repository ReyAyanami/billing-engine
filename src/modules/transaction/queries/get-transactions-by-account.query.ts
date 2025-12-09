import { Query } from '../../../cqrs/base/query';
import { AccountId } from '../../../common/types/branded.types';

/**
 * Parameters for GetTransactionsByAccountQuery
 */
export interface GetTransactionsByAccountQueryParams {
  accountId: AccountId;
  correlationId?: string;
  actorId?: string;
}

/**
 * Query to get all transactions for a specific account.
 */
export class GetTransactionsByAccountQuery extends Query {
  public readonly accountId: AccountId;
  public readonly actorId?: string;

  constructor(params: GetTransactionsByAccountQueryParams) {
    super(params.correlationId);
    this.accountId = params.accountId;
    this.actorId = params.actorId;
  }
}
