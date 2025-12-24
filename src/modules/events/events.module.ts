import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EventsController } from './events.controller';
import { CrossRegionReplicatorService } from './cross-region-replicator.service';
import { KafkaModule } from '../../cqrs/kafka/kafka.module';

@Module({
  imports: [CqrsModule, KafkaModule],
  controllers: [EventsController],
  providers: [CrossRegionReplicatorService],
  exports: [CrossRegionReplicatorService],
})
export class EventsModule { }
