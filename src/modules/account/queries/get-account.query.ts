import { Query } from '../../../cqrs/base/query';

/**
 * Query to get a single account by ID.
 * Returns account projection data for fast reads.
 */
export class GetAccountQuery extends Query {
  constructor(
    public readonly accountId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

