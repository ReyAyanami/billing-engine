import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountCreatedEvent } from '../events/account-created.event';
import { Account } from '../account.entity';

/**
 * Event handler for AccountCreatedEvent.
 * Creates the Account entity in the accounts table (write model).
 * 
 * This is separate from the projection handler to keep concerns separated:
 * - This handler: Write model (accounts table for CRUD operations)
 * - AccountCreatedHandler: Read model (account_projections for queries)
 */
@EventsHandler(AccountCreatedEvent)
export class AccountCreatedEntityHandler implements IEventHandler<AccountCreatedEvent> {
  private readonly logger = new Logger(AccountCreatedEntityHandler.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async handle(event: AccountCreatedEvent): Promise<void> {
    this.logger.log(`📝 Creating Account entity: ${event.aggregateId}`);

    try {
      // Check if account already exists (idempotency)
      const existing = await this.accountRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (existing) {
        this.logger.log(`Account entity already exists: ${event.aggregateId}`);
        return;
      }

      // Insert account with explicit ID using QueryBuilder
      await this.accountRepository
        .createQueryBuilder()
        .insert()
        .into(Account)
        .values({
          id: event.aggregateId,
          ownerId: event.ownerId,
          ownerType: event.ownerType,
          accountType: event.accountType,
          currency: event.currency,
          balance: '0.00',
          maxBalance: event.maxBalance || undefined,
          minBalance: event.minBalance || undefined,
          status: event.status,
          metadata: event.metadata || {},
        } as any)
        .execute();

      this.logger.log(`✅ Account entity created: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create Account entity`, error);
      throw error;
    }
  }
}

