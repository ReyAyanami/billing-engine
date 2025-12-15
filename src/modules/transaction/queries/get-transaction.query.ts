import { Query } from '../../../cqrs/base/query';
import { TransactionId } from '../../../common/types/branded.types';

/**
 * Parameters for GetTransactionQuery
 */
export interface GetTransactionQueryParams {
  transactionId: TransactionId;
  correlationId?: string;
  actorId?: string;
}

/**
 * Query to get a single transaction by ID.
 */
export class GetTransactionQuery extends Query {
  public readonly transactionId: TransactionId;
  public readonly actorId?: string;

  constructor(params: GetTransactionQueryParams) {
    super(params.correlationId);
    this.transactionId = params.transactionId;
    this.actorId = params.actorId;
  }
}
