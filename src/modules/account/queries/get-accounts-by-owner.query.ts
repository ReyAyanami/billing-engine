import { Query } from '../../../cqrs/base/query';

/**
 * Query to get all accounts owned by a specific owner.
 * Returns account projection data for fast reads.
 */
export class GetAccountsByOwnerQuery extends Query {
  constructor(
    public readonly ownerId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}
