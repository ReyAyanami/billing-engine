/**
 * Event Stream Types
 *
 * Defines different streams for event processing with different guarantees:
 * - SAGA: Ordered, transactional coordination (high priority)
 * - PROJECTION: Eventual consistency for read models (async)
 * - INTEGRATION: External system notifications (reliable delivery)
 */

export enum EventStream {
  /**
   * Saga coordination events - processed synchronously in order
   * These events trigger business process orchestration
   */
  SAGA = 'saga',

  /**
   * Projection/read model events - processed asynchronously
   * These events update query-optimized read models
   */
  PROJECTION = 'projection',

  /**
   * Integration events for external systems
   * These events notify external services (webhooks, etc)
   */
  INTEGRATION = 'integration',
}

export interface StreamMetadata {
  /** Which stream this event should be published to */
  stream: EventStream;

  /** Processing priority */
  priority: 'high' | 'normal' | 'low';

  /** Processing guarantees */
  guarantees: {
    /** Must be processed in order */
    ordered: boolean;

    /** At-least-once delivery guarantee */
    atLeastOnce: boolean;

    /** Processed within a transaction */
    transactional: boolean;
  };
}

/**
 * Stream configurations for different event types
 */
export const STREAM_CONFIG: Record<EventStream, StreamMetadata> = {
  [EventStream.SAGA]: {
    stream: EventStream.SAGA,
    priority: 'high',
    guarantees: {
      ordered: true,
      atLeastOnce: true,
      transactional: true,
    },
  },

  [EventStream.PROJECTION]: {
    stream: EventStream.PROJECTION,
    priority: 'normal',
    guarantees: {
      ordered: false,
      atLeastOnce: true,
      transactional: false,
    },
  },

  [EventStream.INTEGRATION]: {
    stream: EventStream.INTEGRATION,
    priority: 'low',
    guarantees: {
      ordered: false,
      atLeastOnce: true,
      transactional: false,
    },
  },
};
