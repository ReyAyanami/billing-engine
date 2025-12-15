import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetTransactionsByAccountQuery } from '../get-transactions-by-account.query';
import { TransactionProjection } from '../../projections/transaction-projection.entity';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Handler for GetTransactionsByAccountQuery.
 * Returns all transactions for a specific account from the read model.
 */
@QueryHandler(GetTransactionsByAccountQuery)
export class GetTransactionsByAccountHandler implements IQueryHandler<GetTransactionsByAccountQuery> {
  private readonly logger = new Logger(GetTransactionsByAccountHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async execute(
    query: GetTransactionsByAccountQuery,
  ): Promise<TransactionProjection[]> {
    this.logger.log(
      `Executing GetTransactionsByAccountQuery for: ${query.accountId}`,
    );

    const projections = await this.projectionService.findByAccount(
      query.accountId,
    );

    this.logger.log(
      `Found ${projections.length} transaction(s) for account: ${query.accountId}`,
    );

    return projections;
  }
}
