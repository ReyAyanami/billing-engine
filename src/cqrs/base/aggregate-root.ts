import { Logger } from '@nestjs/common';
import { DomainEvent } from './domain-event';
import {
  DeserializedEvent,
  isDeserializedEvent,
} from './deserialized-event.interface';

/**
 * Type for events that can be applied to aggregates
 * Can be either a proper DomainEvent instance or a deserialized event from storage
 */
type ApplicableEvent = DomainEvent | DeserializedEvent;

/**
 * Event handler function type
 */
type EventHandler = (event: ApplicableEvent) => void;

/**
 * Base class for all aggregates in the event-sourced system.
 * Aggregates are the consistency boundaries in the domain.
 * They encapsulate business logic and emit events to record state changes.
 */
export abstract class AggregateRoot {
  private static readonly logger = new Logger(AggregateRoot.name);
  /** Unique identifier for this aggregate */
  protected aggregateId!: string;

  /** Current version number (increments with each event) */
  protected version: number = 0;

  /** Events that have been applied but not yet persisted */
  private uncommittedEvents: DomainEvent[] = [];

  /**
   * Returns the aggregate type name (e.g., 'Account', 'Transaction')
   */
  protected abstract getAggregateType(): string;

  /**
   * Applies an event to the aggregate, updating its state.
   * @param event The domain event to apply (can be DomainEvent instance or deserialized)
   * @param isNew Whether this is a new event (true) or historical (false)
   */
  protected apply(event: ApplicableEvent, isNew: boolean = true): void {
    // Find and call the appropriate event handler
    const handler = this.getEventHandler(event);
    if (handler) {
      handler.call(this, event);
    } else {
      // Get event type for warning message
      const eventType = this.getEventType(event);
      AggregateRoot.logger.warn(
        `No handler found [eventType=${eventType}, aggregateType=${this.getAggregateType()}, ` +
          `aggregateId=${this.aggregateId}]`,
      );
    }

    // Add to uncommitted events if this is a new event
    // Only DomainEvent instances should be added (not deserialized events)
    if (isNew && event instanceof DomainEvent) {
      this.uncommittedEvents.push(event);
    }

    // Update version
    this.version = event.aggregateVersion;
  }

  /**
   * Gets the event type from either a DomainEvent or deserialized event
   */
  private getEventType(event: ApplicableEvent): string {
    if (event instanceof DomainEvent) {
      return event.getEventType();
    }

    if (isDeserializedEvent(event)) {
      return event.eventType;
    }

    return 'Unknown';
  }

  /**
   * Finds the event handler method for a given event.
   * Handler methods should be named: on{EventType}
   * Example: onAccountCreated, onBalanceChanged
   */
  private getEventHandler(event: ApplicableEvent): EventHandler | undefined {
    const eventType = this.getEventType(event);

    if (!eventType || eventType === 'Unknown') {
      AggregateRoot.logger.error(
        `Unable to determine event type [aggregateId=${this.aggregateId}]`,
        JSON.stringify(event),
      );
      return undefined;
    }

    const handlerName = `on${eventType}`;
    const handler = (this as Record<string, unknown>)[handlerName];

    if (typeof handler === 'function') {
      return handler as EventHandler;
    }

    return undefined;
  }

  /**
   * Returns all events that have been applied but not yet persisted
   */
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Marks all uncommitted events as committed (persisted)
   */
  commit(): void {
    this.uncommittedEvents = [];
  }

  /**
   * Returns the aggregate's unique identifier
   */
  getId(): string {
    return this.aggregateId;
  }

  /**
   * Returns the current version number
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Reconstructs an aggregate from its event history.
   * This is the core of event sourcing - the aggregate's current state
   * is derived by replaying all its historical events.
   *
   * @param events Array of historical events in chronological order
   * @returns A new instance of the aggregate with state reconstructed from events
   */
  static fromEvents<T extends AggregateRoot>(
    this: new () => T,
    events: DomainEvent[],
  ): T {
    const aggregate = new this();

    // Apply each historical event (isNew = false)
    events.forEach((event) => {
      aggregate.apply(event, false);
    });

    return aggregate;
  }

  /**
   * Validates that the aggregate is in a valid state.
   * Override in subclasses to add validation logic.
   */
  protected validate(): void {
    // Override in subclasses
  }
}
