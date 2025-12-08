import { v4 as uuidv4 } from 'uuid';

/**
 * Base class for all domain events in the event-sourced billing system.
 * Events are immutable facts that have happened in the past.
 */
export abstract class DomainEvent {
  /** Unique identifier for this event */
  readonly eventId: string;

  /** ID of the aggregate this event belongs to */
  readonly aggregateId: string;

  /** Type of aggregate (e.g., 'Account', 'Transaction') */
  readonly aggregateType: string;

  /** Version number of the aggregate after this event */
  readonly aggregateVersion: number;

  /** When this event occurred */
  readonly timestamp: Date;

  /** Correlation ID for tracing related events across the system */
  readonly correlationId: string;

  /** ID of the command or event that caused this event (causality tracking) */
  readonly causationId?: string;

  /** Additional metadata (e.g., user ID, IP address, etc.) */
  readonly metadata?: Record<string, any>;

  constructor(props: {
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, any>;
  }) {
    this.eventId = uuidv4();
    this.aggregateId = props.aggregateId;
    this.aggregateType = props.aggregateType;
    this.aggregateVersion = props.aggregateVersion;
    this.timestamp = new Date();
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.metadata = props.metadata || {};
  }

  /**
   * Returns the event type name (e.g., 'AccountCreated', 'BalanceChanged')
   * Used for event routing and deserialization
   */
  abstract getEventType(): string;

  /**
   * Converts the event to a plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      eventId: this.eventId,
      eventType: this.getEventType(),
      aggregateId: this.aggregateId,
      aggregateType: this.aggregateType,
      aggregateVersion: this.aggregateVersion,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      causationId: this.causationId,
      metadata: this.metadata,
      ...this.getEventData(),
    };
  }

  /**
   * Returns event-specific data for serialization
   * Override in subclasses to include event-specific properties
   */
  protected getEventData(): Record<string, any> {
    return {};
  }
}
