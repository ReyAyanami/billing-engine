import { Query } from '../../../cqrs/base/query';
import { AccountId } from '../../../common/types/branded.types';

/**
 * Parameters for GetAccountQuery
 */
export interface GetAccountQueryParams {
  accountId: AccountId;
  correlationId?: string;
}

/**
 * Query to get a single account by ID.
 * Returns account projection data for fast reads.
 */
export class GetAccountQuery extends Query {
  public readonly accountId: AccountId;

  constructor(params: GetAccountQueryParams) {
    super(params.correlationId);
    this.accountId = params.accountId;
  }
}
