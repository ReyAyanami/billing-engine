import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, IEventHandler } from '@nestjs/cqrs';
import { DomainEvent } from '../base/domain-event';
import {
  SAGA_HANDLER_METADATA,
  PROJECTION_HANDLER_METADATA,
} from '../decorators/saga-handler.decorator';

/**
 * Saga Event Bus
 *
 * Provides ordered, synchronous event processing for saga coordination.
 *
 * Key differences from regular EventBus:
 * - Processes events sequentially (not parallel)
 * - Maintains strict ordering
 * - Faster (in-memory, no Kafka)
 * - Only for saga coordination
 *
 * Regular EventBus is still used for projections (parallel, eventual).
 */
@Injectable()
export class SagaEventBus implements OnModuleInit {
  private readonly logger = new Logger(SagaEventBus.name);
  private sagaHandlers = new Map<string, IEventHandler[]>();
  private processingQueue: DomainEvent[] = [];
  private isProcessing = false;

  constructor(private readonly eventBus: EventBus) {}

  onModuleInit(): void {
    this.logger.log('Initializing Saga Event Bus...');

    // Subscribe to domain events and filter for saga processing
    this.eventBus.subscribe((event: unknown) => {
      // Check if this is a domain event with saga handlers
      if (event && typeof event === 'object' && 'getEventType' in event) {
        const domainEvent = event as DomainEvent;
        const eventType = domainEvent.getEventType();
        if (this.sagaHandlers.has(eventType)) {
          void this.enqueue(domainEvent);
        }
      }
    });

    this.logger.log('Saga Event Bus initialized');
  }

  /**
   * Register a saga handler for an event type
   */
  registerSagaHandler(eventType: string, handler: IEventHandler): void {
    if (!this.sagaHandlers.has(eventType)) {
      this.sagaHandlers.set(eventType, []);
    }

    this.sagaHandlers.get(eventType)!.push(handler);

    this.logger.debug(
      `Registered saga handler for ${eventType} (${handler.constructor.name})`,
    );
  }

  /**
   * Get all registered saga handlers (for diagnostics)
   */
  getSagaHandlers(): Map<string, IEventHandler[]> {
    return new Map(this.sagaHandlers);
  }

  /**
   * Enqueue event for ordered processing
   *
   * Events are processed one at a time in strict order to maintain
   * saga consistency and prevent race conditions.
   */
  private async enqueue(event: DomainEvent): Promise<void> {
    this.processingQueue.push(event);

    this.logger.debug(
      `Enqueued saga event: ${event.getEventType()} ` +
        `[id=${event.eventId}, queue=${this.processingQueue.length}]`,
    );

    if (!this.isProcessing) {
      // Start processing if not already running
      await this.processQueue();
    }
  }

  /**
   * Process events sequentially from the queue
   *
   * This ensures:
   * - Strict event ordering
   * - No concurrent saga execution
   * - Predictable state transitions
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    try {
      while (this.processingQueue.length > 0) {
        const event = this.processingQueue.shift()!;
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single event through all registered saga handlers
   */
  private async processEvent(event: DomainEvent): Promise<void> {
    const eventType = event.getEventType();
    const handlers = this.sagaHandlers.get(eventType) || [];

    if (handlers.length === 0) {
      return; // No saga handlers for this event
    }

    this.logger.debug(
      `Processing saga event: ${eventType} ` +
        `[handlers=${handlers.length}, id=${event.eventId}]`,
    );

    const startTime = Date.now();

    // Execute handlers sequentially (not parallel!)
    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        this.logger.error(
          `Saga handler failed [event=${eventType}, handler=${handler.constructor.name}]`,
          error instanceof Error ? error.stack : String(error),
        );

        // Saga failures should be handled by the saga itself
        // (e.g., mark saga as failed, trigger compensation)
        // We don't stop processing other handlers
      }
    }

    const duration = Date.now() - startTime;

    if (duration > 1000) {
      this.logger.warn(
        `⚠️ Slow saga processing detected: ${eventType} took ${duration}ms. ` +
          `Sagas should complete in < 100ms.`,
      );
    }
  }

  /**
   * Get queue statistics (for monitoring)
   */
  getQueueStats(): {
    queueLength: number;
    isProcessing: boolean;
    sagaHandlerCount: number;
    registeredEvents: string[];
  } {
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      sagaHandlerCount: Array.from(this.sagaHandlers.values()).reduce(
        (sum, handlers) => sum + handlers.length,
        0,
      ),
      registeredEvents: Array.from(this.sagaHandlers.keys()),
    };
  }
}

/**
 * Helper to check if a class is a saga handler
 */
export function isSagaHandler(target: object): boolean {
  return Reflect.getMetadata(SAGA_HANDLER_METADATA, target) === true;
}

/**
 * Helper to check if a class is a projection handler
 */
export function isProjectionHandler(target: object): boolean {
  return Reflect.getMetadata(PROJECTION_HANDLER_METADATA, target) === true;
}
