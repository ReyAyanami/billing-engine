import { Injectable, Logger } from '@nestjs/common';
import { IEventStore } from '../interfaces/event-store.interface';
import { DomainEvent } from '../base/domain-event';
import { KafkaService } from './kafka.service';

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
    expectedVersion?: number,
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

        return {
          key: aggregateId, // Ensures ordering per aggregate
          value: JSON.stringify(eventJson),
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
      const consumer = await this.kafkaService.createConsumer(consumerGroupId);
      const events: DomainEvent[] = [];

      await consumer.subscribe({ topic, fromBeginning: true });

      // Set a timeout to stop consuming after collecting all relevant events
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          consumer
            .disconnect()
            .then(() => {
              this.logger.log(
                `Retrieved ${events.length} event(s) for aggregate ${aggregateId}`,
              );
              resolve(events);
            })
            .catch(reject);
        }, 5000); // 5 second timeout

        consumer
          .run({
            eachMessage: async ({ message }) => {
              try {
                // Only process messages for this specific aggregate
                if (message.key?.toString() === aggregateId) {
                  const eventData = JSON.parse(message.value!.toString());

                  // Apply version filter if specified
                  if (!fromVersion || eventData.aggregateVersion >= fromVersion) {
                    // TODO: Deserialize back to proper DomainEvent subclass
                    // For now, we'll store the raw data
                    events.push(eventData as any);
                  }
                }
              } catch (error) {
                this.logger.error('Error processing message', error);
              }
            },
          })
          .catch((error) => {
            clearTimeout(timeout);
            consumer.disconnect();
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
      let isRunning = true;

      // Start consuming in background
      consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const eventData = JSON.parse(message.value!.toString());

            // Apply timestamp filter if specified
            if (!fromTimestamp || new Date(eventData.timestamp) >= fromTimestamp) {
              eventQueue.push(eventData as any);
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
      this.logger.error(`❌ Failed to stream events for ${aggregateType}`, error);
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

