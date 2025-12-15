import { Query } from '../../../cqrs/base/query';
import { OwnerId } from '../../../common/types/branded.types';

/**
 * Parameters for GetAccountsByOwnerQuery
 */
export interface GetAccountsByOwnerQueryParams {
  ownerId: OwnerId;
  correlationId?: string;
}

/**
 * Query to get all accounts owned by a specific owner.
 * Returns account projection data for fast reads.
 */
export class GetAccountsByOwnerQuery extends Query {
  public readonly ownerId: OwnerId;

  constructor(params: GetAccountsByOwnerQueryParams) {
    super(params.correlationId);
    this.ownerId = params.ownerId;
  }
}
