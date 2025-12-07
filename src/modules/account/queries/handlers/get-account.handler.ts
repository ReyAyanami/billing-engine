import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { GetAccountQuery } from '../get-account.query';
import { AccountProjection } from '../../projections/account-projection.entity';
import { AccountProjectionService } from '../../projections/account-projection.service';

/**
 * Query handler for GetAccountQuery.
 * Returns account data from the read model projection.
 */
@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery> {
  private readonly logger = new Logger(GetAccountHandler.name);

  constructor(private readonly projectionService: AccountProjectionService) {}

  async execute(query: GetAccountQuery): Promise<AccountProjection> {
    this.logger.log(`🔍 Querying account: ${query.accountId}`);

    const projection = await this.projectionService.findById(query.accountId);

    if (!projection) {
      this.logger.warn(`Account not found: ${query.accountId}`);
      throw new NotFoundException(`Account not found: ${query.accountId}`);
    }

    this.logger.log(`✅ Account found: ${query.accountId}`);
    return projection;
  }
}

