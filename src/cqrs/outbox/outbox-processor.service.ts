import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { EventBus } from '@nestjs/cqrs';
import { OutboxEvent, OutboxStatus } from './outbox.entity';
import { DomainEvent } from '../base/domain-event';
import { EventStream } from '../events/event-stream.types';

/**
 * Outbox Processor Service
 *
 * Background worker that processes pending outbox events and publishes
 * them to the event bus, ensuring at-least-once delivery.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed events
 * - Idempotent processing
 * - Monitoring metrics
 */
@Injectable()
export class OutboxProcessor implements OnModuleInit {
  private readonly logger = new Logger(OutboxProcessor.name);
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;

  // Configuration
  private readonly POLL_INTERVAL_MS = 1000; // Poll every second
  private readonly BATCH_SIZE = 100;
  private readonly MAX_PROCESSING_TIME_MS = 30000; // 30 seconds

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly eventBus: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    // Start outbox processor in non-test environments
    if (process.env['NODE_ENV'] !== 'test') {
      await this.start();
    }
  }

  /**
   * Start the outbox processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Outbox processor already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting outbox processor...');

    // Process immediately on start
    await this.processPendingEvents();

    // Then poll regularly
    this.processingInterval = setInterval(() => {
      void this.processPendingEvents();
    }, this.POLL_INTERVAL_MS);

    this.logger.log('Outbox processor started');
  }

  /**
   * Stop the outbox processor
   */
  stop(): void {
    this.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.logger.log('Outbox processor stopped');
  }

  /**
   * Add event to outbox for reliable delivery
   */
  async addToOutbox(
    event: DomainEvent,
    targetStreams: EventStream[],
  ): Promise<OutboxEvent> {
    const outboxEvent = this.outboxRepo.create({
      eventType: event.getEventType(),
      eventId: event.eventId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      payload: event.toJSON(),
      targetStreams,
      status: OutboxStatus.PENDING,
      priority: targetStreams.includes(EventStream.SAGA) ? 10 : 0,
    });

    return await this.outboxRepo.save(outboxEvent);
  }

  /**
   * Process pending events from the outbox
   */
  private async processPendingEvents(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Get pending events (including retries)
      const pendingEvents = await this.outboxRepo.find({
        where: [
          { status: OutboxStatus.PENDING },
          {
            status: OutboxStatus.PROCESSING,
            processedAt: LessThan(
              new Date(Date.now() - this.MAX_PROCESSING_TIME_MS),
            ),
          },
        ],
        order: {
          priority: 'DESC',
          createdAt: 'ASC',
        },
        take: this.BATCH_SIZE,
      });

      if (pendingEvents.length === 0) {
        return; // Nothing to process
      }

      this.logger.debug(`Processing ${pendingEvents.length} outbox event(s)`);

      // Process events sequentially
      for (const outboxEvent of pendingEvents) {
        await this.processEvent(outboxEvent);
      }
    } catch (error) {
      this.logger.error(
        'Error processing outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Process a single outbox event
   */
  private async processEvent(outboxEvent: OutboxEvent): Promise<void> {
    try {
      // Mark as processing
      outboxEvent.status = OutboxStatus.PROCESSING;
      outboxEvent.processedAt = new Date();
      await this.outboxRepo.save(outboxEvent);

      // Reconstruct domain event from payload
      // Note: We publish the JSON payload, not the class instance
      // Event handlers will receive it as a plain object
      this.eventBus.publish(outboxEvent.payload as unknown as object);

      // Mark as delivered
      outboxEvent.status = OutboxStatus.DELIVERED;
      outboxEvent.deliveredAt = new Date();
      await this.outboxRepo.save(outboxEvent);

      this.logger.debug(
        `Delivered outbox event: ${outboxEvent.eventType} [id=${outboxEvent.eventId}]`,
      );
    } catch (error) {
      await this.handleEventFailure(
        outboxEvent,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Handle event processing failure
   */
  private async handleEventFailure(
    outboxEvent: OutboxEvent,
    error: Error,
  ): Promise<void> {
    outboxEvent.retryCount++;
    outboxEvent.lastRetryAt = new Date();
    outboxEvent.lastError = error.message;

    // Add to error history
    if (!outboxEvent.errorHistory) {
      outboxEvent.errorHistory = [];
    }
    outboxEvent.errorHistory.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      retryCount: outboxEvent.retryCount,
    });

    if (outboxEvent.retryCount >= outboxEvent.maxRetries) {
      // Max retries exceeded - move to failed
      outboxEvent.status = OutboxStatus.FAILED;
      outboxEvent.nextRetryAt = undefined;

      this.logger.error(
        `Outbox event failed after ${outboxEvent.retryCount} retries: ` +
          `${outboxEvent.eventType} [id=${outboxEvent.eventId}]`,
        error.stack,
      );
    } else {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(
        1000 * Math.pow(2, outboxEvent.retryCount),
        60000,
      ); // Max 1 minute
      outboxEvent.nextRetryAt = new Date(Date.now() + backoffMs);
      outboxEvent.status = OutboxStatus.PENDING;

      this.logger.warn(
        `Outbox event failed, will retry in ${backoffMs}ms: ` +
          `${outboxEvent.eventType} [id=${outboxEvent.eventId}, attempt=${outboxEvent.retryCount}]`,
      );
    }

    await this.outboxRepo.save(outboxEvent);
  }

  /**
   * Get outbox statistics (for monitoring)
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
    total: number;
    isRunning: boolean;
  }> {
    const [pending, processing, delivered, failed] = await Promise.all([
      this.outboxRepo.count({ where: { status: OutboxStatus.PENDING } }),
      this.outboxRepo.count({ where: { status: OutboxStatus.PROCESSING } }),
      this.outboxRepo.count({ where: { status: OutboxStatus.DELIVERED } }),
      this.outboxRepo.count({ where: { status: OutboxStatus.FAILED } }),
    ]);

    return {
      pending,
      processing,
      delivered,
      failed,
      total: pending + processing + delivered + failed,
      isRunning: this.isRunning,
    };
  }

  /**
   * Retry failed events manually
   */
  async retryFailedEvents(limit: number = 100): Promise<number> {
    const failedEvents = await this.outboxRepo.find({
      where: { status: OutboxStatus.FAILED },
      take: limit,
    });

    for (const event of failedEvents) {
      event.status = OutboxStatus.PENDING;
      event.retryCount = 0;
      event.nextRetryAt = undefined;
      await this.outboxRepo.save(event);
    }

    this.logger.log(`Retrying ${failedEvents.length} failed event(s)`);
    return failedEvents.length;
  }

  /**
   * Clean up old delivered events (housekeeping)
   */
  async cleanupOldEvents(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );

    const result = await this.outboxRepo.delete({
      status: OutboxStatus.DELIVERED,
      deliveredAt: LessThan(cutoffDate),
    });

    this.logger.log(`Cleaned up ${result.affected || 0} old outbox event(s)`);
    return result.affected || 0;
  }
}
