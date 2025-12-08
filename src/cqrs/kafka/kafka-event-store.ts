import { Injectable, Logger } from '@nestjs/common';
import { IEventStore } from '../interfaces/event-store.interface';
import { DomainEvent } from '../base/domain-event';
import { KafkaService } from './kafka.service';
import {
  validateDeserializedEvent,
  parseJsonSafe,
} from '../../common/validation/runtime-validators';

/**
 * Kafka implementation of the Event Store.
 * Stores all domain events in Kafka topics for event sourcing.
 */
@Injectable()
export class KafkaEventStore implements IEventStore {
  private readonly logger = new Logger(KafkaEventStore.name);

  constructor(private kafkaService: KafkaService) {}

  /**
   * Appends new events to Kafka for a specific aggregate.
   * Events are published to the aggregate-specific topic with the aggregateId as the key
   * to ensure all events for the same aggregate go to the same partition (ordering guarantee).
   */
  async append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _expectedVersion?: number,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const topic = this.getTopicName(aggregateType);
    const producer = this.kafkaService.getProducer();

    try {
      // TODO: Implement optimistic concurrency check with expectedVersion
      // For now, we'll skip version checking and implement it later

      const messages = events.map((event) => {
        const eventJson = event.toJSON();
        const serializedEvent = JSON.stringify(eventJson);

        // Validate message size before sending
        this.validateMessageSize(serializedEvent, event, aggregateId);

        return {
          key: aggregateId, // Ensures ordering per aggregate
          value: serializedEvent,
          headers: {
            eventType: Buffer.from(event.getEventType()),
            eventVersion: Buffer.from('1'), // Schema version
            aggregateType: Buffer.from(aggregateType),
            aggregateVersion: Buffer.from(event.aggregateVersion.toString()),
            correlationId: Buffer.from(event.correlationId),
            timestamp: Buffer.from(event.timestamp.toISOString()),
          },
        };
      });

      await producer.send({
        topic,
        messages,
      });

      this.logger.log(
        `✅ Appended ${events.length} event(s) to ${topic} for aggregate ${aggregateId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to append events to ${topic} for aggregate ${aggregateId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Validates the size of a message before sending to Kafka.
   * Prevents oversized messages that will be rejected by the broker.
   *
   * Kafka default limits:
   * - message.max.bytes (broker): 1MB default, 100MB configured
   * - max.request.size (producer): 1MB default, 10MB recommended
   */
  private validateMessageSize(
    serializedEvent: string,
    event: DomainEvent,
    aggregateId: string,
  ): void {
    const sizeInBytes = Buffer.byteLength(serializedEvent, 'utf8');
    const sizeInMB = sizeInBytes / (1024 * 1024);

    // Hard limit: Reject messages larger than 10MB
    // This is 10x smaller than broker limit to leave room for batching and headers
    const MAX_MESSAGE_SIZE_MB = 10;
    const MAX_MESSAGE_SIZE_BYTES = MAX_MESSAGE_SIZE_MB * 1024 * 1024;

    // Warning threshold: Log warning for messages larger than 1MB
    const WARNING_THRESHOLD_MB = 1;
    const WARNING_THRESHOLD_BYTES = WARNING_THRESHOLD_MB * 1024 * 1024;

    if (sizeInBytes > MAX_MESSAGE_SIZE_BYTES) {
      const error = new Error(
        `Event message size (${sizeInMB.toFixed(2)} MB) exceeds maximum allowed size (${MAX_MESSAGE_SIZE_MB} MB). ` +
          `Event type: ${event.getEventType()}, Aggregate ID: ${aggregateId}, Event ID: ${event.eventId}. ` +
          `This usually indicates a bug where too much data is being included in the event (e.g., large metadata objects, circular references). ` +
          `Review the event data and reduce its size.`,
      );
      this.logger.error(error.message);
      throw error;
    }

    if (sizeInBytes > WARNING_THRESHOLD_BYTES) {
      this.logger.warn(
        `⚠️ Large event detected (${sizeInMB.toFixed(2)} MB): ${event.getEventType()} for aggregate ${aggregateId}. ` +
          `Event ID: ${event.eventId}. Consider reducing event size to improve performance.`,
      );

      // Log a sample of the event data to help with debugging (first 500 chars)
      const eventSample = serializedEvent.substring(0, 500);
      this.logger.debug(`Event data sample: ${eventSample}...`);
    }
  }

  /**
   * Retrieves all events for a specific aggregate by consuming from Kafka.
   * This is used for aggregate reconstruction (event replay).
   *
   * Note: This is a simplified implementation for development.
   * In production, you'd want to:
   * - Cache aggregate state (snapshots)
   * - Use a dedicated read model for event storage
   * - Or use Kafka Streams for stateful processing
   */
  async getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]> {
    const topic = this.getTopicName(aggregateType);
    const consumerGroupId = `${aggregateId}-loader-${Date.now()}`;

    try {
      this.logger.log(
        `Retrieving events for ${aggregateType}/${aggregateId} from topic ${topic}`,
      );

      const consumer = await this.kafkaService.createConsumer(consumerGroupId);
      const events: DomainEvent[] = [];

      await consumer.subscribe({ topics: [topic], fromBeginning: true });
      this.logger.log(`Consumer subscribed to topic ${topic}`);

      // Set a timeout to stop consuming after collecting all relevant events
      return new Promise((resolve, reject) => {
        let messageCount = 0;
        let consumerStarted = false;

        const timeout = setTimeout(() => {
          this.logger.log(
            `Timeout reached for ${aggregateId}. Consumer started: ${consumerStarted}, ` +
              `Messages processed: ${messageCount}, Events found: ${events.length}`,
          );
          void consumer
            .disconnect()
            .then(() => {
              this.logger.log(
                `Retrieved ${events.length} event(s) for aggregate ${aggregateId}`,
              );
              resolve(events);
            })
            .catch(reject);
        }, 15000); // 15 second timeout (increased for test stability)

        void consumer
          .run({
            // eslint-disable-next-line @typescript-eslint/require-await
            eachMessage: async ({ message }) => {
              consumerStarted = true;
              messageCount++;

              try {
                const messageKey = message.key?.toString();

                // Only process messages for this specific aggregate
                if (messageKey === aggregateId) {
                  // Parse and validate event data
                  const parseResult = parseJsonSafe(
                    message.value!.toString(),
                    validateDeserializedEvent,
                  );

                  if (!parseResult.success) {
                    this.logger.warn(
                      `Invalid event data for ${aggregateId}: ${parseResult.error}`,
                    );
                    return;
                  }

                  const eventData = parseResult.data as Record<string, unknown>;
                  const eventType =
                    typeof eventData.eventType === 'string'
                      ? eventData.eventType
                      : 'unknown';
                  const version = String(eventData.aggregateVersion);
                  this.logger.debug(
                    `Found event for ${aggregateId}: ${eventType} (version ${version})`,
                  );

                  // Apply version filter if specified
                  if (
                    !fromVersion ||
                    (typeof eventData.aggregateVersion === 'number' &&
                      eventData.aggregateVersion >= fromVersion)
                  ) {
                    events.push(eventData as unknown as DomainEvent);
                  }
                }
              } catch (error) {
                this.logger.error(
                  'Error processing message in getEvents',
                  error,
                );
              }
            },
          })
          .catch((error) => {
            clearTimeout(timeout);
            this.logger.error(
              `Consumer error for aggregate ${aggregateId}:`,
              error,
            );
            consumer.disconnect().catch(() => {});
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
          });
      });
    } catch (error) {
      this.logger.error(
        `❌ Failed to retrieve events for aggregate ${aggregateId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Streams all events of a specific aggregate type.
   * Useful for rebuilding projections or batch processing.
   */
  async *getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date,
  ): AsyncGenerator<DomainEvent> {
    const topic = this.getTopicName(aggregateType);
    const consumerGroupId = `${aggregateType}-stream-${Date.now()}`;

    try {
      const consumer = await this.kafkaService.createConsumer(consumerGroupId);

      await consumer.subscribe({ topic, fromBeginning: true });

      const eventQueue: DomainEvent[] = [];
      const isRunning = true;

      // Start consuming in background
      void consumer.run({
        // eslint-disable-next-line @typescript-eslint/require-await
        eachMessage: async ({ message }) => {
          try {
            // Parse and validate event data
            const parseResult = parseJsonSafe(
              message.value!.toString(),
              validateDeserializedEvent,
            );

            if (!parseResult.success) {
              this.logger.warn(
                `Invalid event data in stream: ${parseResult.error}`,
              );
              return;
            }

            const eventData = parseResult.data as Record<string, unknown>;

            // Apply timestamp filter if specified
            if (
              !fromTimestamp ||
              (typeof eventData.timestamp === 'string' &&
                new Date(eventData.timestamp) >= fromTimestamp)
            ) {
              eventQueue.push(eventData as unknown as DomainEvent);
            }
          } catch (error) {
            this.logger.error('Error processing message in stream', error);
          }
        },
      });

      // Yield events as they arrive
      while (isRunning) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      await consumer.disconnect();
    } catch (error) {
      this.logger.error(
        `❌ Failed to stream events for ${aggregateType}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Returns the Kafka topic name for a given aggregate type.
   * Format: billing.{aggregateType}.events
   */
  private getTopicName(aggregateType: string): string {
    return `billing.${aggregateType.toLowerCase()}.events`;
  }
}
