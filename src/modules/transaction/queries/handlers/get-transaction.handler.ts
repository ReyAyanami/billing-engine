import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { GetTransactionQuery } from '../get-transaction.query';
import { TransactionProjection } from '../../projections/transaction-projection.entity';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Handler for GetTransactionQuery.
 * Returns transaction data from the read model (projection).
 */
@QueryHandler(GetTransactionQuery)
export class GetTransactionHandler implements IQueryHandler<GetTransactionQuery> {
  private readonly logger = new Logger(GetTransactionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async execute(query: GetTransactionQuery): Promise<TransactionProjection> {
    this.logger.log(`Executing GetTransactionQuery for: ${query.transactionId}`);

    const projection = await this.projectionService.findById(query.transactionId);

    if (!projection) {
      throw new NotFoundException(`Transaction not found: ${query.transactionId}`);
    }

    return projection;
  }
}

