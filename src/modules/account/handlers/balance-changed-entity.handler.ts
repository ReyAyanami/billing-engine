import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { Account } from '../account.entity';

/**
 * Event handler for BalanceChangedEvent.
 * Updates the Account entity balance in the accounts table (write model).
 */
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedEntityHandler implements IEventHandler<BalanceChangedEvent> {
  private readonly logger = new Logger(BalanceChangedEntityHandler.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async handle(event: BalanceChangedEvent): Promise<void> {
    this.logger.log(`📝 Updating Account entity balance: ${event.aggregateId}`);

    try {
      const account = await this.accountRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (!account) {
        this.logger.error(`Account not found: ${event.aggregateId}`);
        throw new Error(`Account not found: ${event.aggregateId}`);
      }

      account.balance = event.newBalance;
      await this.accountRepository.save(account);

      this.logger.log(`✅ Account entity balance updated: ${event.aggregateId} (${event.newBalance})`);
    } catch (error) {
      this.logger.error(`❌ Failed to update Account entity balance`, error);
      throw error;
    }
  }
}

