import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { SagaState } from './saga/saga-state.entity';
import { OutboxEvent } from './outbox/outbox.entity';
import { SagaCoordinator } from './saga/saga-coordinator.service';
import { SagaEventBus } from './saga/saga-event-bus.service';
import { OutboxProcessor } from './outbox/outbox-processor.service';
import { SagaController } from './saga/saga.controller';
import { WorkflowTimer } from './saga/workflow-timer.entity';
import { TimerService } from './saga/timer.service';
import { TimerProcessor } from './saga/timer.processor';

/**
 * CQRS Saga Module
 *
 * Provides saga orchestration and outbox pattern infrastructure:
 * - SagaCoordinator: Track saga state
 * - SagaEventBus: Ordered saga event processing
 * - OutboxProcessor: Guaranteed event delivery
 * - TimerService/Processor: Durable scheduling
 *
 * This module should be imported by AppModule to enable
 * production-grade CQRS/Event Sourcing patterns.
 */
@Global()
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([SagaState, OutboxEvent, WorkflowTimer]),
  ],
  controllers: [SagaController],
  providers: [
    SagaCoordinator,
    SagaEventBus,
    OutboxProcessor,
    TimerService,
    TimerProcessor,
  ],
  exports: [
    SagaCoordinator,
    SagaEventBus,
    OutboxProcessor,
    TimerService,
    TimerProcessor,
  ],
})
export class CqrsSagaModule { }
