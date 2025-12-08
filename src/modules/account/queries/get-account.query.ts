import { Query } from '../../../cqrs/base/query';
import { AccountId } from '../../../common/types/branded.types';

/**
 * Query to get a single account by ID.
 * Returns account projection data for fast reads.
 */
export class GetAccountQuery extends Query {
  constructor(
    public readonly accountId: AccountId,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}
