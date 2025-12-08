import { Query } from '../../../cqrs/base/query';
import { OwnerId } from '../../../common/types/branded.types';

/**
 * Query to get all accounts owned by a specific owner.
 * Returns account projection data for fast reads.
 */
export class GetAccountsByOwnerQuery extends Query {
  constructor(
    public readonly ownerId: OwnerId,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}
