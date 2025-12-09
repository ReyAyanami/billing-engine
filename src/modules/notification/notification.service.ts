import { Injectable, Logger } from '@nestjs/common';
import { AccountStatus } from '../account/account.types';

/**
 * Notification types supported by the system
 */
export enum NotificationType {
  ACCOUNT_CREATED = 'account.created',
  ACCOUNT_STATUS_CHANGED = 'account.status_changed',
  BALANCE_LOW = 'balance.low',
  BALANCE_HIGH = 'balance.high',
  BALANCE_CREDITED = 'balance.credited',
  BALANCE_DEBITED = 'balance.debited',
  TRANSACTION_COMPLETED = 'transaction.completed',
  TRANSACTION_FAILED = 'transaction.failed',
}

/**
 * Notification payload interface
 */
export interface NotificationPayload {
  type: NotificationType;
  accountId: string;
  ownerId: string;
  ownerType: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Service for sending notifications and webhooks.
 *
 * In production, this would integrate with:
 * - Email service (SendGrid, AWS SES)
 * - SMS service (Twilio)
 * - Push notifications (FCM, APNs)
 * - Webhook delivery system
 * - Message queue for async processing
 *
 * For now, this logs notifications for demonstration purposes.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /**
   * Sends a notification for account creation
   */
  notifyAccountCreated(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    currency: string;
    accountType: string;
  }): void {
    const payload: NotificationPayload = {
      type: NotificationType.ACCOUNT_CREATED,
      accountId: params.accountId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      data: {
        currency: params.currency,
        accountType: params.accountType,
      },
      timestamp: new Date(),
    };

    this.sendNotification(payload);
  }

  /**
   * Sends a notification for account status changes
   */
  notifyAccountStatusChanged(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    previousStatus: AccountStatus;
    newStatus: AccountStatus;
    reason: string;
  }): void {
    const payload: NotificationPayload = {
      type: NotificationType.ACCOUNT_STATUS_CHANGED,
      accountId: params.accountId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      data: {
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        reason: params.reason,
      },
      timestamp: new Date(),
    };

    this.sendNotification(payload);

    // Trigger compliance checks for specific status changes
    if (
      params.newStatus === AccountStatus.SUSPENDED ||
      params.newStatus === AccountStatus.CLOSED
    ) {
      this.triggerComplianceCheck(
        params.accountId,
        params.newStatus,
        params.reason,
      );
    }
  }

  /**
   * Sends a notification for balance changes
   */
  notifyBalanceChanged(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    previousBalance: string;
    newBalance: string;
    changeType: 'CREDIT' | 'DEBIT';
    changeAmount: string;
    minBalance?: string;
    maxBalance?: string;
  }): void {
    const newBalanceNum = parseFloat(params.newBalance);
    const minBalanceNum = params.minBalance
      ? parseFloat(params.minBalance)
      : undefined;
    const maxBalanceNum = params.maxBalance
      ? parseFloat(params.maxBalance)
      : undefined;

    // Check for low balance alert
    if (minBalanceNum !== undefined && newBalanceNum <= minBalanceNum * 1.1) {
      this.notifyLowBalance({
        accountId: params.accountId,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        balance: params.newBalance,
        minBalance: params.minBalance!,
      });
    }

    // Check for high balance alert
    if (maxBalanceNum !== undefined && newBalanceNum >= maxBalanceNum * 0.9) {
      this.notifyHighBalance({
        accountId: params.accountId,
        ownerId: params.ownerId,
        ownerType: params.ownerType,
        balance: params.newBalance,
        maxBalance: params.maxBalance!,
      });
    }

    // General balance change notification
    const notificationType =
      params.changeType === 'CREDIT'
        ? NotificationType.BALANCE_CREDITED
        : NotificationType.BALANCE_DEBITED;

    const payload: NotificationPayload = {
      type: notificationType,
      accountId: params.accountId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      data: {
        previousBalance: params.previousBalance,
        newBalance: params.newBalance,
        changeAmount: params.changeAmount,
        changeType: params.changeType,
      },
      timestamp: new Date(),
    };

    this.sendNotification(payload);
  }

  /**
   * Sends a low balance alert
   */
  private notifyLowBalance(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    balance: string;
    minBalance: string;
  }): void {
    const payload: NotificationPayload = {
      type: NotificationType.BALANCE_LOW,
      accountId: params.accountId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      data: {
        balance: params.balance,
        minBalance: params.minBalance,
        threshold: '10%', // Within 10% of min balance
      },
      timestamp: new Date(),
    };

    this.sendNotification(payload);
  }

  /**
   * Sends a high balance alert
   */
  private notifyHighBalance(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    balance: string;
    maxBalance: string;
  }): void {
    const payload: NotificationPayload = {
      type: NotificationType.BALANCE_HIGH,
      accountId: params.accountId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      data: {
        balance: params.balance,
        maxBalance: params.maxBalance,
        threshold: '90%', // Within 10% of max balance
      },
      timestamp: new Date(),
    };

    this.sendNotification(payload);
  }

  /**
   * Triggers compliance checks for account status changes
   * In production, this would integrate with compliance monitoring systems
   */
  private triggerComplianceCheck(
    accountId: string,
    newStatus: AccountStatus,
    reason: string,
  ): void {
    this.logger.log(
      `🔍 Triggering compliance check for account ${accountId} (status: ${newStatus}, reason: ${reason})`,
    );

    // In production, this would:
    // - Log to compliance monitoring system
    // - Create audit trail entries
    // - Notify compliance team if needed
    // - Check against regulatory requirements
    // - Generate compliance reports
  }

  /**
   * Core method to send notifications
   * In production, this would:
   * - Queue notification for async processing
   * - Determine delivery channels (email, SMS, push, webhook)
   * - Handle retry logic
   * - Track delivery status
   */
  private sendNotification(payload: NotificationPayload): void {
    this.logger.log(
      `📧 Notification: ${payload.type} for account ${payload.accountId} (owner: ${payload.ownerId})`,
    );

    // Log notification details for demonstration
    this.logger.debug(
      `Notification payload: ${JSON.stringify(payload, null, 2)}`,
    );

    // In production, implement actual notification delivery:
    // - await this.emailService.send(...)
    // - await this.smsService.send(...)
    // - await this.webhookService.deliver(...)
    // - await this.pushService.send(...)
  }
}
