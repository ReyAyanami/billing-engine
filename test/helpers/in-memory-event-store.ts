import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { DomainEvent } from '../../src/cqrs/base/domain-event';
import { IEventStore } from '../../src/cqrs/interfaces/event-store.interface';

/**
 * In-memory event store for testing purposes ONLY.
 * Provides fast, reliable event storage without Kafka overhead.
 *
 * ⚠️ WARNING: This is a TEST-ONLY implementation!
 * - Does NOT persist events (data lost on restart)
 * - Does NOT support distributed systems
 * - Does NOT scale beyond single process
 *
 * NEVER use this in production! Use KafkaEventStore instead.
 */
@Injectable()
export class InMemoryEventStore implements IEventStore {
  private readonly logger = new Logger(InMemoryEventStore.name);
  private readonly events: Map<string, DomainEvent[]> = new Map();

  constructor(eventBus?: EventBus) {
    // GUARDRAIL: Prevent accidental production use
    this.validateTestEnvironment();
    void eventBus; // Reserved for future event publishing

    this.logger.warn('⚠️  InMemoryEventStore initialized - TEST MODE ONLY');
    this.logger.warn(
      '⚠️  Events are NOT persisted and will be lost on restart!',
    );
  }

  /**
   * Validates that this is only used in test environment
   * @throws Error if used in production
   */
  private validateTestEnvironment(): void {
    const nodeEnv = process.env['NODE_ENV'];
    const isTest =
      nodeEnv === 'test' || process.env['JEST_WORKER_ID'] !== undefined;

    if (!isTest) {
      const error = `
╔════════════════════════════════════════════════════════════════╗
║  ⛔ CRITICAL ERROR: InMemoryEventStore in Production           ║
╠════════════════════════════════════════════════════════════════╣
║  InMemoryEventStore is a TEST-ONLY implementation!             ║
║                                                                 ║
║  Issues:                                                        ║
║  - Events are NOT persisted (lost on restart)                  ║
║  - No distributed system support                               ║
║  - No event replay capability                                  ║
║  - No scalability beyond single process                        ║
║                                                                 ║
║  ✅ Solution:                                                   ║
║  Use AppModule (with KafkaEventStore) instead of AppTestModule ║
║                                                                 ║
║  Current NODE_ENV: ${nodeEnv || 'undefined'}                   ║
╚════════════════════════════════════════════════════════════════╝
      `;

      this.logger.error(error);
      throw new Error(
        'InMemoryEventStore cannot be used outside test environment',
      );
    }
  }

  /**
   * Appends events to the in-memory store.
   * Validates aggregate version for optimistic concurrency control.
   */
  async append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number,
  ): Promise<void> {
    const key = this.getKey(aggregateType, aggregateId);
    const existingEvents = this.events.get(key) || [];

    // Optimistic concurrency check
    if (expectedVersion !== undefined) {
      const currentVersion = existingEvents.length;
      if (currentVersion !== expectedVersion) {
        throw new Error(
          `Concurrency conflict: Expected version ${expectedVersion}, but current version is ${currentVersion}`,
        );
      }
    }

    // Store events (ensure they're valid DomainEvent objects)
    const validEvents = events.filter((e) => e && typeof e === 'object');
    if (validEvents.length !== events.length) {
      this.logger.warn(
        `Filtered out ${events.length - validEvents.length} invalid events`,
      );
    }

    if (validEvents.length > 0) {
      const firstEvent = validEvents[0];
      this.logger.debug(
        `First event type: ${firstEvent?.constructor?.name || 'unknown'}`,
      );
    }

    const allEvents = [...existingEvents, ...validEvents];
    this.events.set(key, allEvents);

    this.logger.log(
      `✅ Appended ${validEvents.length} event(s) to ${aggregateType}/${aggregateId} (total: ${allEvents.length})`,
    );

    // NOTE: We don't publish events here because command handlers already do it.
    // Publishing here would cause duplicate event processing and projection errors.
    // The command handlers call eventBus.publish() after saving to the event store.
  }

  /**
   * Retrieves all events for a specific aggregate.
   * Returns immediately - no network latency!
   */
  async getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]> {
    const key = this.getKey(aggregateType, aggregateId);
    const storedEvents = this.events.get(key) || [];

    // Convert events to plain objects if they have toJSON method
    const events = storedEvents.map((event) => {
      if (event && typeof event.toJSON === 'function') {
        const jsonEvent = event.toJSON();
        // Ensure timestamp is a string for deserialized events
        if (jsonEvent['timestamp'] instanceof Date) {
          jsonEvent['timestamp'] = (
            jsonEvent['timestamp'] as Date
          ).toISOString();
        }
        return jsonEvent;
      }
      return event;
    });

    // Apply version filter if specified
    const filteredEvents =
      fromVersion !== undefined
        ? events.filter((e: any) => e.aggregateVersion >= fromVersion)
        : events;

    this.logger.debug(
      `📥 Retrieved ${filteredEvents.length} event(s) for ${aggregateType}/${aggregateId}`,
    );

    return filteredEvents as any;
  }

  /**
   * Streams all events of a specific aggregate type.
   * Useful for rebuilding projections.
   */
  async *getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date,
  ): AsyncGenerator<DomainEvent> {
    const prefix = `${aggregateType}:`;

    for (const [key, events] of this.events.entries()) {
      if (key.startsWith(prefix)) {
        for (const event of events) {
          // Apply timestamp filter if specified
          if (!fromTimestamp || new Date(event.timestamp) >= fromTimestamp) {
            yield event;
          }
        }
      }
    }
  }

  /**
   * Test helper: Clear all events (useful for test cleanup).
   */
  clear(): void {
    this.events.clear();
    this.logger.log('🧹 All events cleared');
  }

  /**
   * Test helper: Get total event count.
   */
  getEventCount(): number {
    let count = 0;
    for (const events of this.events.values()) {
      count += events.length;
    }
    return count;
  }

  /**
   * Test helper: Get all aggregate keys.
   */
  getAggregateKeys(): string[] {
    return Array.from(this.events.keys());
  }

  private getKey(aggregateType: string, aggregateId: string): string {
    return `${aggregateType}:${aggregateId}`;
  }
}
