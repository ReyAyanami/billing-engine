import { KafkaEventStore } from '../../src/cqrs/kafka/kafka-event-store';

/**
 * Test helper to poll for events from Kafka event store.
 * Retries until events are available or timeout is reached.
 */
export class EventPollingHelper {
  constructor(private readonly eventStore: KafkaEventStore) {}

  /**
   * Poll for events until they're available or timeout
   */
  async waitForEvents(
    aggregateType: string,
    aggregateId: string,
    options: {
      minEvents?: number;
      maxRetries?: number;
      retryDelayMs?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<any[]> {
    const {
      minEvents = 1,
      maxRetries = 20,
      retryDelayMs = 500,
      timeoutMs = 15000,
    } = options;

    const startTime = Date.now();
    let retries = 0;

    while (retries < maxRetries) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Timeout waiting for events. Aggregate: ${aggregateType}/${aggregateId}, ` +
            `Expected: ${minEvents} events, Got: 0 events after ${timeoutMs}ms`,
        );
      }

      try {
        const events = await this.eventStore.getEvents(
          aggregateType,
          aggregateId,
        );

        if (events && events.length >= minEvents) {
          console.log(
            `✅ [EventPolling] Found ${events.length} event(s) for ${aggregateType}/${aggregateId} ` +
              `after ${retries} retries (${Date.now() - startTime}ms)`,
          );
          return events;
        }

        console.log(
          `⏳ [EventPolling] Retry ${retries + 1}/${maxRetries}: ` +
            `Found ${events?.length || 0}/${minEvents} events, waiting ${retryDelayMs}ms...`,
        );
      } catch (error) {
        console.log(
          `⏳ [EventPolling] Retry ${retries + 1}/${maxRetries}: ` +
            `Error retrieving events (${error.message}), waiting ${retryDelayMs}ms...`,
        );
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      retries++;
    }

    throw new Error(
      `Failed to retrieve events after ${maxRetries} retries. ` +
        `Aggregate: ${aggregateType}/${aggregateId}, Expected: ${minEvents} events`,
    );
  }

  /**
   * Wait for projection to be updated by checking the database
   */
  async waitForProjection<T>(
    fetchFn: () => Promise<T | null>,
    validateFn: (projection: T) => boolean,
    options: {
      maxRetries?: number;
      retryDelayMs?: number;
      timeoutMs?: number;
      description?: string;
    } = {},
  ): Promise<T> {
    const {
      maxRetries = 20,
      retryDelayMs = 500,
      timeoutMs = 15000,
      description = 'projection',
    } = options;

    const startTime = Date.now();
    let retries = 0;

    while (retries < maxRetries) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Timeout waiting for ${description}. ` +
            `No valid projection found after ${timeoutMs}ms`,
        );
      }

      try {
        const projection = await fetchFn();

        if (projection && validateFn(projection)) {
          console.log(
            `✅ [ProjectionPolling] Found valid ${description} ` +
              `after ${retries} retries (${Date.now() - startTime}ms)`,
          );
          return projection;
        }

        console.log(
          `⏳ [ProjectionPolling] Retry ${retries + 1}/${maxRetries}: ` +
            `${description} not ready, waiting ${retryDelayMs}ms...`,
        );
      } catch (error) {
        console.log(
          `⏳ [ProjectionPolling] Retry ${retries + 1}/${maxRetries}: ` +
            `Error (${error.message}), waiting ${retryDelayMs}ms...`,
        );
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      retries++;
    }

    throw new Error(
      `Failed to find valid ${description} after ${maxRetries} retries`,
    );
  }
}
