import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { AccountStatus } from './account.types';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateAccountCommand } from './commands/create-account.command';
import { GetAccountQuery } from './queries/get-account.query';
import { GetAccountsByOwnerQuery } from './queries/get-accounts-by-owner.query';
import { AccountProjection } from './projections/account-projection.entity';
import {
  AccountNotFoundException,
  AccountInactiveException,
  InvalidOperationException,
} from '../../common/exceptions/billing.exception';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import { OperationContext } from '../../common/types';
import { AccountId, OwnerId } from '../../common/types/branded.types';
import { assertNever } from '../../common/utils/exhaustive-check';

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
      accountType: createAccountDto.accountType,
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
        accountType: createAccountDto.accountType,
        currency: createAccountDto.currency,
      },
      context,
    );

    // Return projection (read side) - eventually consistent
    // In practice, give events a moment to propagate
    await this.waitForProjection(accountId);
    
    return await this.findById(accountId);
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
  async findByOwner(ownerId: OwnerId, ownerType: string): Promise<AccountProjection[]> {
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
   * Update account status (should use CQRS command in future)
   * TODO: Create UpdateAccountStatusCommand for proper event sourcing
   */
  async updateStatus(
    id: AccountId,
    status: AccountStatus,
    context: OperationContext,
  ): Promise<AccountProjection> {
    const account = await this.findById(id);

    // Validate status transition
    this.validateStatusTransition(account.status, status);

    this.logger.warn(
      `updateStatus currently bypasses event sourcing - TODO: implement UpdateAccountStatusCommand`
    );

    // TODO: Send UpdateAccountStatusCommand instead of direct update
    // For now, this is a known gap in the implementation

    // Audit log
    await this.auditService.log(
      'Account',
      account.id,
      'UPDATE_STATUS',
      {
        oldStatus: account.status,
        newStatus: status,
      },
      context,
    );

    // Return updated projection
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
        await this.findById(accountId);
        return; // Found it!
      } catch (error) {
        if (i === maxAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      }
    }
  }

  private validateStatusTransition(
    currentStatus: AccountStatus,
    newStatus: AccountStatus,
  ): void {
    // Get valid transitions based on current status
    const validTransitions = this.getValidStatusTransitions(currentStatus);

    if (!validTransitions.includes(newStatus)) {
      throw new InvalidOperationException(
        `Cannot transition account from ${currentStatus} to ${newStatus}`,
        { currentStatus, newStatus },
      );
    }
  }

  /**
   * Returns valid status transitions for a given status.
   * Uses exhaustive checking to ensure all enum values are handled.
   */
  private getValidStatusTransitions(status: AccountStatus): AccountStatus[] {
    switch (status) {
      case AccountStatus.ACTIVE:
        return [AccountStatus.SUSPENDED, AccountStatus.CLOSED];

      case AccountStatus.SUSPENDED:
        return [AccountStatus.ACTIVE, AccountStatus.CLOSED];

      case AccountStatus.CLOSED:
        return []; // Terminal state - no transitions allowed

      default:
        // Compile-time exhaustiveness check
        // If a new AccountStatus is added, this will cause a type error
        return assertNever(status);
    }
  }
}
