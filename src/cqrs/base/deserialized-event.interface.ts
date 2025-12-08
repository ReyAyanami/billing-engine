/**
 * Interface for deserialized events from the event store
 *
 * When events are loaded from Kafka, they come as plain objects (not class instances).
 * This interface defines the structure of these deserialized events.
 */

import { EventMetadata } from '../../common/types/metadata.types';

export interface DeserializedEvent {
  /** Unique identifier for this event */
  eventId: string;

  /** Type of event (e.g., 'AccountCreated', 'BalanceChanged') */
  eventType: string;

  /** ID of the aggregate this event belongs to */
  aggregateId: string;

  /** Type of aggregate (e.g., 'Account', 'Transaction') */
  aggregateType: string;

  /** Version number of the aggregate after this event */
  aggregateVersion: number;

  /** When this event occurred (ISO string) */
  timestamp: string;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Causation ID (optional) */
  causationId?: string;

  /** Event metadata */
  metadata?: EventMetadata;

  /** Event-specific data */
  [key: string]: unknown;
}

/**
 * Type guard to check if an object is a deserialized event
 */
export function isDeserializedEvent(obj: unknown): obj is DeserializedEvent {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const event = obj as Record<string, unknown>;

  return (
    typeof event['eventId'] === 'string' &&
    typeof event['eventType'] === 'string' &&
    typeof event['aggregateId'] === 'string' &&
    typeof event['aggregateType'] === 'string' &&
    typeof event['aggregateVersion'] === 'number' &&
    typeof event['timestamp'] === 'string' &&
    typeof event['correlationId'] === 'string'
  );
}
