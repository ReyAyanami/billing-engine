import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { KafkaService } from '../../cqrs/kafka/kafka.service';
import type { IEventStore } from '../../cqrs/interfaces/event-store.interface';
import { ConfigService } from '@nestjs/config';
import { DomainEvent } from '../../cqrs/base/domain-event';
import { AggregateRoot } from '../../cqrs/base/aggregate-root';
import { parseJsonSafe, validateDeserializedEvent } from '../../common/validation/runtime-validators';
import { EachMessagePayload } from 'kafkajs';

/**
 * Service responsible for replicating events from remote regions to the local region.
 * 
 * Key features:
 * - Subscribes to remote Kafka topics for aggregate events.
 * - Deduplicates events based on regionId to prevent circular replication.
 * - Updates local HLC to maintain causal consistency across regions.
 * - Appends remote events to the local event store.
 */
@Injectable()
export class CrossRegionReplicatorService implements OnModuleInit {
    private readonly logger = new Logger(CrossRegionReplicatorService.name);
    private readonly localRegionId: string;
    private readonly remoteRegions: string[];

    constructor(
        private kafkaService: KafkaService,
        @Inject('EVENT_STORE') private eventStore: IEventStore,
        private configService: ConfigService,
    ) {
        this.localRegionId = this.configService.get<string>('REGION_ID', 'unknown');
        this.remoteRegions = this.configService.get<string>('REMOTE_REGIONS', '').split(',').filter(r => r !== '');
    }

    async onModuleInit() {
        if (this.remoteRegions.length === 0) {
            this.logger.warn('No remote regions configured for replication.');
            return;
        }

        this.logger.log(`Starting replication from regions: ${this.remoteRegions.join(', ')}`);
        await this.startReplicationLoop();
    }

    private async startReplicationLoop() {
        const consumerGroupId = `replicator-${this.localRegionId}`;
        const consumer = await this.kafkaService.createConsumer(consumerGroupId);

        // Subscribe to aggregate topics
        const topics = [
            'billing.account.events',
            'billing.transaction.events'
        ];

        await consumer.subscribe({ topics, fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, message }: EachMessagePayload) => {
                try {
                    if (!message.value) return;

                    const parseResult = parseJsonSafe(
                        message.value.toString(),
                        validateDeserializedEvent,
                    );

                    if (!parseResult.success) {
                        this.logger.warn(`Failed to parse event for replication from topic ${topic}: ${parseResult.error}`);
                        return;
                    }

                    const event = parseResult.data as any;

                    // DEDUPLICATION: Ignore events originating from our own region to prevent infinite loops
                    if (event.regionId === this.localRegionId) {
                        return;
                    }

                    this.logger.debug(`Replicating event ${event.eventId} [${event.eventType}] from region ${event.regionId}`);

                    // CAUSAL CONSISTENCY: Catch up local HLC to the remote event's timestamp
                    if (event.hlcTimestamp) {
                        // Update the static HLC on AggregateRoot to ensure local operations take this into account
                        (AggregateRoot as any).hlc.update(event.hlcTimestamp);
                    }

                    // PERSIST: Append to local store
                    // Note: Replicated events skip version checks because they are already committed 'facts'
                    await this.eventStore.append(
                        event.aggregateType,
                        event.aggregateId,
                        [event as unknown as DomainEvent]
                    );

                    this.logger.log(`✅ Replicated ${event.eventType} [${event.eventId}] from ${event.regionId} to local store`);
                } catch (error) {
                    this.logger.error(`Error replicating message from topic ${topic}:`, error);
                }
            },
        });
    }
}
