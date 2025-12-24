import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { WorkflowTimer, TimerStatus } from './workflow-timer.entity';
import { EventBus } from '@nestjs/cqrs';

/**
 * Background worker that processes triggered timers.
 */
@Injectable()
export class TimerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimerProcessor.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(WorkflowTimer)
    private timerRepository: Repository<WorkflowTimer>,
    private eventBus: EventBus,
  ) {}

  onModuleInit() {
    this.logger.log('Starting TimerProcessor...');
    this.interval = setInterval(() => this.processTimers(), 5000); // Check every 5 seconds
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  private async processTimers() {
    const now = new Date();
    const pendingTimers = await this.timerRepository.find({
      where: {
        status: TimerStatus.PENDING,
        executeAt: LessThanOrEqual(now),
      },
      take: 20,
    });

    for (const timer of pendingTimers) {
      try {
        this.logger.log(
          `Triggering timer ${timer.timerId} for saga ${timer.sagaId}`,
        );

        // Dispatch event or command based on payload
        // For simplicity, we'll publish the payload as an event
        this.eventBus.publish(timer.payload);

        timer.status = TimerStatus.TRIGGERED;
        await this.timerRepository.save(timer);
      } catch (error) {
        this.logger.error(`Failed to trigger timer ${timer.timerId}:`, error);
        timer.status = TimerStatus.FAILED;
        await this.timerRepository.save(timer);
      }
    }
  }
}
