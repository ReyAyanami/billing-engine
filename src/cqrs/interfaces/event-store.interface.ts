import { DomainEvent } from '../base/domain-event';

/**
 * Interface for the event store.
 * The event store is the source of truth in an event-sourced system.
 * It persists all domain events and allows retrieving them for aggregate reconstruction.
 */
export interface IEventStore {
  /**
   * Appends new events to the event store for a specific aggregate.
   *
   * @param aggregateType Type of aggregate (e.g., 'Account', 'Transaction')
   * @param aggregateId Unique identifier of the aggregate
   * @param events Array of new events to append
   * @param expectedVersion Expected version of the aggregate (for optimistic concurrency)
   * @throws ConcurrencyException if expectedVersion doesn't match actual version
   */
  append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number,
  ): Promise<void>;

  /**
   * Retrieves all events for a specific aggregate.
   *
   * @param aggregateType Type of aggregate
   * @param aggregateId Unique identifier of the aggregate
   * @param fromVersion Optional version to start from (for incremental loading)
   * @returns Array of events in chronological order
   */
  getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]>;

  /**
   * Streams all events of a specific aggregate type.
   * Useful for rebuilding projections or processing all aggregates.
   *
   * @param aggregateType Type of aggregate
   * @param fromTimestamp Optional timestamp to start from
   * @returns Async generator yielding events
   */
  getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date,
  ): AsyncGenerator<DomainEvent>;
}

