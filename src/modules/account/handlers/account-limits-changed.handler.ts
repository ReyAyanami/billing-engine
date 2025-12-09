import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountLimitsChangedEvent } from '../events/account-limits-changed.event';
import { AccountProjectionService } from '../projections/account-projection.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Event handler for AccountLimitsChangedEvent.
 * Updates the read model projection when account limits change.
 */
@EventsHandler(AccountLimitsChangedEvent)
export class AccountLimitsChangedHandler implements IEventHandler<AccountLimitsChangedEvent> {
  private readonly logger = new Logger(AccountLimitsChangedHandler.name);

  constructor(
    private readonly projectionService: AccountProjectionService,
    private readonly auditService: AuditService,
  ) {}

  async handle(event: AccountLimitsChangedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling AccountLimitsChangedEvent for account: ${event.aggregateId}`,
    );

    if (event.newMaxBalance !== undefined) {
      this.logger.log(
        `   Max Balance: ${event.previousMaxBalance || 'none'} → ${event.newMaxBalance}`,
      );
    }

    if (event.newMinBalance !== undefined) {
      this.logger.log(
        `   Min Balance: ${event.previousMinBalance || 'none'} → ${event.newMinBalance}`,
      );
    }

    if (event.reason) {
      this.logger.log(`   Reason: ${event.reason}`);
    }

    try {
      // Update read model projection
      const projection = await this.projectionService.handleAccountLimitsChanged(event);

      // Audit log for compliance
      await this.auditService.log(
        'Account',
        event.aggregateId,
        'LIMITS_CHANGED',
        {
          previousMaxBalance: event.previousMaxBalance || null,
          newMaxBalance: event.newMaxBalance || null,
          previousMinBalance: event.previousMinBalance || null,
          newMinBalance: event.newMinBalance || null,
          reason: event.reason || null,
          ownerId: projection.ownerId,
          ownerType: projection.ownerType,
        },
        {
          correlationId: event.correlationId,
          actorId: event.metadata?.actorId as string | undefined,
          actorType: 'system',
          timestamp: event.timestamp,
        },
      );

      this.logger.log(`✅ AccountLimitsChangedEvent processed successfully`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process AccountLimitsChangedEvent`,
        error,
      );
      throw error;
    }
  }
}
