import { Module, Global } from '@nestjs/common';
import { KafkaEventStore } from './kafka-event-store';
import { KafkaService } from './kafka.service';

/**
 * Global module providing Kafka integration for event sourcing.
 * Makes KafkaService and EventStore available throughout the application.
 */
@Global()
@Module({
  providers: [
    KafkaService,
    {
      provide: 'EVENT_STORE',
      useClass: KafkaEventStore,
    },
    // Also provide KafkaEventStore directly for cases where type is needed
    KafkaEventStore,
  ],
  exports: ['EVENT_STORE', KafkaService, KafkaEventStore],
})
export class KafkaModule {}
