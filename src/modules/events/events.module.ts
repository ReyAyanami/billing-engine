import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EventsController } from './events.controller';

@Module({
  imports: [CqrsModule],
  controllers: [EventsController],
})
export class EventsModule {}
