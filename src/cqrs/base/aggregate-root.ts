import { DomainEvent } from './domain-event';

/**
 * Base class for all aggregates in the event-sourced system.
 * Aggregates are the consistency boundaries in the domain.
 * They encapsulate business logic and emit events to record state changes.
 */
export abstract class AggregateRoot {
  /** Unique identifier for this aggregate */
  protected aggregateId: string;

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
   * @param event The domain event to apply
   * @param isNew Whether this is a new event (true) or historical (false)
   */
  protected apply(event: DomainEvent | any, isNew: boolean = true): void {
    // Find and call the appropriate event handler
    const handler = this.getEventHandler(event);
    if (handler) {
      handler.call(this, event);
    } else {
      // Get event type for warning message
      const eventType =
        typeof event.getEventType === 'function'
          ? event.getEventType()
          : event.eventType || 'Unknown';
      console.warn(
        `No handler found for event ${eventType} on aggregate ${this.getAggregateType()}`,
      );
    }

    // Add to uncommitted events if this is a new event
    if (isNew) {
      this.uncommittedEvents.push(event);
    }

    // Update version
    this.version = event.aggregateVersion;
  }

  /**
   * Finds the event handler method for a given event.
   * Handler methods should be named: on{EventType}
   * Example: onAccountCreated, onBalanceChanged
   */
  private getEventHandler(event: DomainEvent | any): Function | undefined {
    // Handle both proper DomainEvent instances and plain objects from event store
    let eventType: string;

    if (typeof event.getEventType === 'function') {
      // Proper DomainEvent instance
      eventType = event.getEventType();
    } else if (event.eventType) {
      // Plain object from event store
      eventType = event.eventType;
    } else {
      console.error('Unable to determine event type from event:', event);
      return undefined;
    }

    const handlerName = `on${eventType}`;

    const handler = (this as any)[handlerName];
    if (typeof handler === 'function') {
      return handler;
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
