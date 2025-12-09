import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { AccountStatus, AccountType } from './account.types';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateAccountCommand } from './commands/create-account.command';
import { UpdateAccountStatusCommand } from './commands/update-account-status.command';
import { GetAccountQuery } from './queries/get-account.query';
import { GetAccountsByOwnerQuery } from './queries/get-accounts-by-owner.query';
import { AccountProjection } from './projections/account-projection.entity';
import {
  AccountNotFoundException,
  AccountInactiveException,
} from '../../common/exceptions/billing.exception';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import { OperationContext } from '../../common/types';
import { AccountId, OwnerId } from '../../common/types/branded.types';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly currencyService: CurrencyService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new account using pure CQRS/Event Sourcing.
   * Command → Aggregate → Events → Projection
   */
  async create(
    createAccountDto: CreateAccountDto,
    context: OperationContext,
  ): Promise<AccountProjection> {
    // Validate currency
    await this.currencyService.validateCurrency(createAccountDto.currency);

    // Generate account ID
    const accountId = uuidv4();

    // Create command (write side)
    const command = new CreateAccountCommand({
      accountId,
      ownerId: createAccountDto.ownerId,
      ownerType: createAccountDto.ownerType,
      accountType: createAccountDto.accountType || AccountType.USER,
      currency: createAccountDto.currency,
      maxBalance: createAccountDto.maxBalance,
      minBalance: createAccountDto.minBalance,
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    // Execute command (emits events to Kafka)
    await this.commandBus.execute(command);

    // Audit log
    await this.auditService.log(
      'Account',
      accountId,
      'CREATE',
      {
        ownerId: createAccountDto.ownerId,
        ownerType: createAccountDto.ownerType,
        accountType: createAccountDto.accountType || AccountType.USER,
        currency: createAccountDto.currency,
      },
      context,
    );

    // Return projection (read side) - eventually consistent
    // In practice, give events a moment to propagate
    await this.waitForProjection(accountId);
    
    return await this.findById(accountId as AccountId);
  }

  /**
   * Find account by ID (from projection/read model)
   */
  async findById(id: AccountId): Promise<AccountProjection> {
    const query = new GetAccountQuery({ accountId: id });
    const account = await this.queryBus.execute<GetAccountQuery, AccountProjection>(query);

    if (!account) {
      throw new AccountNotFoundException(id);
    }

    return account;
  }

  /**
   * Find accounts by owner (from projection/read model)
   */
  async findByOwner(ownerId: OwnerId): Promise<AccountProjection[]> {
    const query = new GetAccountsByOwnerQuery({ ownerId });
    return await this.queryBus.execute<GetAccountsByOwnerQuery, AccountProjection[]>(query);
  }

  /**
   * Get account balance
   */
  async getBalance(
    id: AccountId,
  ): Promise<{ balance: string; currency: string; status: string }> {
    const account = await this.findById(id);
    return {
      balance: account.balance,
      currency: account.currency,
      status: account.status,
    };
  }

  /**
   * Update account status using CQRS/Event Sourcing.
   * Command → Aggregate → Events → Projection
   */
  async updateStatus(
    id: AccountId,
    status: AccountStatus,
    context: OperationContext,
  ): Promise<AccountProjection> {
    this.logger.log(`Updating status for account ${id} to ${status}`);

    // Create and execute command
    const command = new UpdateAccountStatusCommand({
      accountId: id,
      newStatus: status,
      reason: `Status update requested via API`,
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    await this.commandBus.execute(command);

    // Wait for projection to be updated (eventual consistency)
    await this.waitForProjection(id);

    // Audit log
    await this.auditService.log(
      'Account',
      id,
      'UPDATE_STATUS',
      {
        newStatus: status,
      },
      context,
    );

    return await this.findById(id);
  }

  /**
   * Validate account can perform transactions
   */
  validateAccountActive(account: AccountProjection): void {
    if (account.status !== AccountStatus.ACTIVE) {
      throw new AccountInactiveException(account.id, account.status);
    }
  }

  /**
   * Wait for projection to be created (eventual consistency)
   * In production, use a more sophisticated polling/subscription mechanism
   */
  private async waitForProjection(accountId: string, maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.findById(accountId as AccountId);
        return; // Found it!
      } catch (error) {
        if (i === maxAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      }
    }
  }

}
