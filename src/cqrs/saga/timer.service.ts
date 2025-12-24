import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowTimer, TimerStatus } from './workflow-timer.entity';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service to manage durable timers for workflows.
 */
@Injectable()
export class TimerService {
  private readonly logger = new Logger(TimerService.name);

  constructor(
    @InjectRepository(WorkflowTimer)
    private timerRepository: Repository<WorkflowTimer>,
  ) {}

  async schedule(params: {
    sagaId: string;
    executeAt: Date;
    payload: any;
  }): Promise<string> {
    const timerId = uuidv4();
    const timer = this.timerRepository.create({
      timerId,
      sagaId: params.sagaId,
      executeAt: params.executeAt,
      payload: params.payload,
      status: TimerStatus.PENDING,
    });

    await this.timerRepository.save(timer);
    this.logger.log(
      `Scheduled timer ${timerId} for saga ${params.sagaId} at ${params.executeAt.toISOString()}`,
    );
    return timerId;
  }

  async cancel(timerId: string): Promise<void> {
    await this.timerRepository.update(timerId, {
      status: TimerStatus.CANCELLED,
    });
    this.logger.log(`Cancelled timer ${timerId}`);
  }
}
