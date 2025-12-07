import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { GetAccountsByOwnerQuery } from '../get-accounts-by-owner.query';
import { AccountProjection } from '../../projections/account-projection.entity';
import { AccountProjectionService } from '../../projections/account-projection.service';

/**
 * Query handler for GetAccountsByOwnerQuery.
 * Returns all accounts for a specific owner from the read model projection.
 */
@QueryHandler(GetAccountsByOwnerQuery)
export class GetAccountsByOwnerHandler
  implements IQueryHandler<GetAccountsByOwnerQuery>
{
  private readonly logger = new Logger(GetAccountsByOwnerHandler.name);

  constructor(private readonly projectionService: AccountProjectionService) {}

  async execute(query: GetAccountsByOwnerQuery): Promise<AccountProjection[]> {
    this.logger.log(`🔍 Querying accounts for owner: ${query.ownerId}`);

    const projections = await this.projectionService.findByOwnerId(query.ownerId);

    this.logger.log(`✅ Found ${projections.length} account(s) for owner: ${query.ownerId}`);
    return projections;
  }
}

