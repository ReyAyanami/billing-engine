import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { Account, AccountStatus, AccountType } from './account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreateAccountCommand } from './commands/create-account.command';
import {
  AccountNotFoundException,
  AccountInactiveException,
  InvalidOperationException,
} from '../../common/exceptions/billing.exception';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import { OperationContext } from '../../common/types';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly currencyService: CurrencyService,
    private readonly auditService: AuditService,
    private readonly commandBus: CommandBus,
  ) {}

  async create(
    createAccountDto: CreateAccountDto,
    context: OperationContext,
  ): Promise<Account> {
    // Validate currency
    await this.currencyService.validateCurrency(createAccountDto.currency);

    // Create account directly (non-CQRS for simplicity)
    const account = this.accountRepository.create({
      ownerId: createAccountDto.ownerId,
      ownerType: createAccountDto.ownerType,
      accountType: createAccountDto.accountType,
      accountSubtype: createAccountDto.accountSubtype,
      currency: createAccountDto.currency,
      balance: '0',
      maxBalance: createAccountDto.maxBalance,
      minBalance: createAccountDto.minBalance,
      status: AccountStatus.ACTIVE,
      metadata: createAccountDto.metadata || {},
    });

    const savedAccount = await this.accountRepository.save(account);

    // ALSO save to event store for CQRS sagas
    // This ensures sagas can find the account
    const command = new CreateAccountCommand(
      savedAccount.id,
      savedAccount.ownerId,
      savedAccount.ownerType,
      savedAccount.accountType,
      savedAccount.currency,
      savedAccount.maxBalance || undefined,
      savedAccount.minBalance || undefined,
      context.correlationId,
      context.actorId,
    );

    try {
      await this.commandBus.execute(command);
    } catch (error) {
      // If CQRS fails, log but don't fail the request
      // (Hybrid architecture: HTTP works even if CQRS fails)
      this.logger.warn(
        `CQRS command failed (non-fatal) [accountId=${savedAccount.id}, ` +
        `ownerId=${savedAccount.ownerId}, correlationId=${context.correlationId}]`,
        error.stack,
      );
    }

    // Audit log
    await this.auditService.log(
      'Account',
      savedAccount.id,
      'CREATE',
      {
        ownerId: savedAccount.ownerId,
        ownerType: savedAccount.ownerType,
        accountType: savedAccount.accountType,
        currency: savedAccount.currency,
      },
      context,
    );

    return savedAccount;
  }

  async findById(id: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['currencyDetails'],
    });

    if (!account) {
      throw new AccountNotFoundException(id);
    }

    return account;
  }

  async findByOwner(ownerId: string, ownerType: string): Promise<Account[]> {
    return await this.accountRepository.find({
      where: { ownerId, ownerType },
      relations: ['currencyDetails'],
      order: { createdAt: 'DESC' },
    });
  }

  async getBalance(
    id: string,
  ): Promise<{ balance: string; currency: string; status: string }> {
    const account = await this.findById(id);
    return {
      balance: account.balance,
      currency: account.currency,
      status: account.status,
    };
  }

  async updateStatus(
    id: string,
    status: AccountStatus,
    context: OperationContext,
  ): Promise<Account> {
    const account = await this.findById(id);

    // Validate status transition
    this.validateStatusTransition(account.status, status);

    const oldStatus = account.status;
    account.status = status;

    const updatedAccount = await this.accountRepository.save(account);

    // Audit log
    await this.auditService.log(
      'Account',
      account.id,
      'UPDATE_STATUS',
      {
        oldStatus,
        newStatus: status,
      },
      context,
    );

    return updatedAccount;
  }

  /**
   * Find and lock account for update (used in transactions)
   */
  async findAndLock(id: string, manager: EntityManager): Promise<Account> {
    const account = await manager.findOne(Account, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!account) {
      throw new AccountNotFoundException(id);
    }

    return account;
  }

  /**
   * Validate account can perform transactions
   */
  validateAccountActive(account: Account): void {
    if (account.status !== AccountStatus.ACTIVE) {
      throw new AccountInactiveException(account.id, account.status);
    }
  }

  /**
   * Update account balance (used in transactions)
   */
  async updateBalance(
    account: Account,
    newBalance: string,
    manager: EntityManager,
  ): Promise<Account> {
    account.balance = newBalance;
    return await manager.save(Account, account);
  }

  private validateStatusTransition(
    currentStatus: AccountStatus,
    newStatus: AccountStatus,
  ): void {
    const validTransitions: Record<AccountStatus, AccountStatus[]> = {
      [AccountStatus.ACTIVE]: [AccountStatus.SUSPENDED, AccountStatus.CLOSED],
      [AccountStatus.SUSPENDED]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
      [AccountStatus.CLOSED]: [], // Terminal state
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new InvalidOperationException(
        `Cannot transition account from ${currentStatus} to ${newStatus}`,
        { currentStatus, newStatus },
      );
    }
  }
}
