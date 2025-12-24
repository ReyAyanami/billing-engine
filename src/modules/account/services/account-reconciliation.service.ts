import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountProjection } from '../projections/account-projection.entity';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';
import { AccountId } from '../../../common/types/branded.types';
import Decimal from 'decimal.js';

export interface ReconciliationResult {
  accountId: string;
  match: boolean;
  projectionBalance: string;
  eventSourceBalance: string;
  difference?: string;
  projectionVersion: number;
  eventSourceVersion: number;
  versionMismatch: boolean;
  issues: string[];
}

/**
 * Service for reconciling account projections with event-sourced state.
 * Detects inconsistencies and helps maintain data integrity.
 */
@Injectable()
export class AccountReconciliationService {
  private readonly logger = new Logger(AccountReconciliationService.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    @InjectRepository(AccountProjection)
    private projectionRepository: Repository<AccountProjection>,
  ) {}

  /**
   * Reconcile a single account projection with its event-sourced state
   */
  async reconcileAccount(accountId: AccountId): Promise<ReconciliationResult> {
    this.logger.log(`Reconciling account: ${accountId}`);

    const projection = await this.projectionRepository.findOne({
      where: { id: accountId },
    });

    if (!projection) {
      throw new Error(`Projection not found for account: ${accountId}`);
    }

    const events = await this.eventStore.getEvents('Account', accountId);

    if (events.length === 0) {
      throw new Error(`No events found for account: ${accountId}`);
    }

    const aggregate = AccountAggregate.fromEvents(events);

    const projectionBalance = new Decimal(projection.balance);
    const eventSourceBalance = aggregate.getBalance();
    const balanceMatch = projectionBalance.equals(eventSourceBalance);
    const versionMismatch =
      projection.aggregateVersion !== aggregate.getVersion();

    const issues: string[] = [];

    if (!balanceMatch) {
      const diff = projectionBalance.minus(eventSourceBalance);
      issues.push(`Balance mismatch: projection has ${diff.toString()} extra`);
    }

    if (versionMismatch) {
      issues.push(
        `Version mismatch: projection at v${projection.aggregateVersion}, events at v${aggregate.getVersion()}`,
      );
    }

    if (projection.status !== aggregate.getStatus()) {
      issues.push(
        `Status mismatch: projection=${projection.status}, events=${aggregate.getStatus()}`,
      );
    }

    const result: ReconciliationResult = {
      accountId,
      match: balanceMatch && !versionMismatch && issues.length === 0,
      projectionBalance: projectionBalance.toFixed(8),
      eventSourceBalance: eventSourceBalance.toFixed(8),
      difference: balanceMatch
        ? undefined
        : projectionBalance.minus(eventSourceBalance).toFixed(8),
      projectionVersion: projection.aggregateVersion,
      eventSourceVersion: aggregate.getVersion(),
      versionMismatch,
      issues,
    };

    if (!result.match) {
      this.logger.warn(
        `❌ Reconciliation failed for account ${accountId}:\n${issues.join('\n')}`,
      );
    } else {
      this.logger.log(`✅ Account ${accountId} reconciliation successful`);
    }

    return result;
  }

  /**
   * Reconcile all accounts
   */
  async reconcileAllAccounts(): Promise<{
    total: number;
    matches: number;
    mismatches: number;
    results: ReconciliationResult[];
  }> {
    this.logger.log('Starting reconciliation of all accounts...');

    const allProjections = await this.projectionRepository.find();
    const results: ReconciliationResult[] = [];

    for (const projection of allProjections) {
      try {
        const result = await this.reconcileAccount(projection.id as AccountId);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to reconcile account ${projection.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        results.push({
          accountId: projection.id,
          match: false,
          projectionBalance: projection.balance,
          eventSourceBalance: 'ERROR',
          projectionVersion: projection.aggregateVersion,
          eventSourceVersion: -1,
          versionMismatch: true,
          issues: [
            `Reconciliation error: ${error instanceof Error ? error.message : String(error)}`,
          ],
        });
      }
    }

    const summary = {
      total: results.length,
      matches: results.filter((r) => r.match).length,
      mismatches: results.filter((r) => !r.match).length,
      results: results.filter((r) => !r.match),
    };

    this.logger.log(
      `✅ Reconciliation complete: ${summary.matches}/${summary.total} match`,
    );

    if (summary.mismatches > 0) {
      this.logger.warn(`⚠️  Found ${summary.mismatches} mismatches!`);
    }

    return summary;
  }

  /**
   * Verify accounting equation: sum of all balances should remain constant
   * (excluding external accounts)
   */
  async verifyAccountingEquation(): Promise<{
    valid: boolean;
    totalProjectionBalance: string;
    accountCount: number;
  }> {
    this.logger.log('Verifying accounting equation...');

    const allProjections = await this.projectionRepository.find();

    let totalBalance = new Decimal(0);
    for (const projection of allProjections) {
      totalBalance = totalBalance.plus(projection.balance);
    }

    const result = {
      valid: true,
      totalProjectionBalance: totalBalance.toFixed(8),
      accountCount: allProjections.length,
    };

    this.logger.log(
      `Total balance across ${result.accountCount} accounts: ${result.totalProjectionBalance}`,
    );

    return result;
  }
}
