import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SagaState, SagaStatus } from './saga-state.entity';

export interface StartSagaParams {
  sagaId: string;
  sagaType: string;
  correlationId: string;
  steps: string[];
  metadata?: Record<string, unknown>;
}

export interface CompleteStepParams {
  sagaId: string;
  step: string;
  result?: unknown;
}

export interface FailSagaParams {
  sagaId: string;
  step: string;
  error: Error;
  canCompensate?: boolean;
}

/**
 * Saga Coordinator Service
 *
 * Manages saga lifecycle and state tracking.
 * Provides immediate consistency for saga status queries.
 *
 * Key responsibilities:
 * - Track saga execution state
 * - Coordinate compensation on failure
 * - Provide saga status for API queries
 * - Enable saga recovery after crashes
 */
@Injectable()
export class SagaCoordinator {
  private readonly logger = new Logger(SagaCoordinator.name);

  constructor(
    @InjectRepository(SagaState)
    private readonly sagaStateRepo: Repository<SagaState>,
  ) {}

  /**
   * Start a new saga and track its state
   */
  async startSaga(params: StartSagaParams): Promise<SagaState> {
    this.logger.log(
      `Starting saga [type=${params.sagaType}, id=${params.sagaId}]`,
    );

    const saga = this.sagaStateRepo.create({
      sagaId: params.sagaId,
      sagaType: params.sagaType,
      correlationId: params.correlationId,
      status: SagaStatus.PROCESSING,
      state: {
        currentStep: 1,
        totalSteps: params.steps.length,
        completedSteps: [],
        pendingSteps: params.steps,
        compensationActions: [],
        activityHistory: {},
      },
      metadata: params.metadata,
    });

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Mark a saga step as completed
   */
  async completeStep(params: CompleteStepParams): Promise<SagaState> {
    const saga = await this.getSaga(params.sagaId);

    if (!saga) {
      throw new Error(`Saga not found: ${params.sagaId}`);
    }

    // Update state
    saga.state.completedSteps.push(params.step);
    saga.state.pendingSteps = saga.state.pendingSteps.filter(
      (s) => s !== params.step,
    );
    saga.state.currentStep = saga.state.completedSteps.length + 1;

    // Check if saga is complete
    if (saga.state.pendingSteps.length === 0) {
      saga.status = SagaStatus.COMPLETED;
      saga.completedAt = new Date();
      saga.result = {
        success: true,
        data: params.result,
      };

      this.logger.log(
        `Saga completed [type=${saga.sagaType}, id=${saga.sagaId}]`,
      );
    } else {
      this.logger.debug(
        `Saga step completed [id=${saga.sagaId}, step=${params.step}, ` +
          `remaining=${saga.state.pendingSteps.length}]`,
      );
    }

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Mark saga as failed and trigger compensation if possible
   */
  async failSaga(params: FailSagaParams): Promise<SagaState> {
    const saga = await this.getSaga(params.sagaId);

    if (!saga) {
      throw new Error(`Saga not found: ${params.sagaId}`);
    }

    saga.state.failedStep = params.step;
    saga.result = {
      success: false,
      error: {
        code: params.error.name,
        message: params.error.message,
        stack: params.error.stack,
      },
    };

    if (params.canCompensate) {
      saga.status = SagaStatus.COMPENSATING;
      this.logger.warn(
        `Saga failed, starting compensation [id=${saga.sagaId}, step=${params.step}]`,
      );
    } else {
      saga.status = SagaStatus.FAILED;
      saga.completedAt = new Date();
      this.logger.error(
        `Saga failed without compensation [id=${saga.sagaId}, step=${params.step}]`,
        params.error.stack,
      );
    }

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Add a compensation action to saga history
   */
  async recordCompensation(
    sagaId: string,
    action: string,
    result?: string,
  ): Promise<SagaState> {
    const saga = await this.getSaga(sagaId);

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    saga.state.compensationActions.push({
      action,
      timestamp: new Date().toISOString(),
      result,
    });

    this.logger.log(
      `Compensation recorded [sagaId=${sagaId}, action=${action}]`,
    );

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Complete compensation and mark saga as failed
   */
  async completeCompensation(sagaId: string): Promise<SagaState> {
    const saga = await this.getSaga(sagaId);

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    saga.status = SagaStatus.FAILED;
    saga.completedAt = new Date();

    this.logger.log(
      `Compensation completed, saga marked as failed [id=${sagaId}]`,
    );

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Get saga by ID
   */
  async getSaga(sagaId: string): Promise<SagaState | null> {
    return await this.sagaStateRepo.findOne({ where: { sagaId } });
  }

  /**
   * Get saga by correlation ID (transaction ID)
   */
  async getSagaByCorrelation(correlationId: string): Promise<SagaState | null> {
    return await this.sagaStateRepo.findOne({ where: { correlationId } });
  }

  /**
   * Check if saga is complete
   */
  async isSagaComplete(sagaId: string): Promise<boolean> {
    const saga = await this.getSaga(sagaId);
    return (
      saga?.status === SagaStatus.COMPLETED ||
      saga?.status === SagaStatus.FAILED ||
      saga?.status === SagaStatus.CANCELLED
    );
  }

  /**
   * Get all sagas for a specific type
   */
  async getSagasByType(
    sagaType: string,
    limit: number = 100,
  ): Promise<SagaState[]> {
    return await this.sagaStateRepo.find({
      where: { sagaType },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get pending sagas (for recovery/monitoring)
   */
  async getPendingSagas(limit: number = 100): Promise<SagaState[]> {
    return await this.sagaStateRepo.find({
      where: [
        { status: SagaStatus.PENDING },
        { status: SagaStatus.PROCESSING },
        { status: SagaStatus.COMPENSATING },
      ],
      order: { startedAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Record the result of an activity (side-effect) for idempotency
   */
  async recordActivity(params: {
    sagaId: string;
    activityId: string;
    result: any;
    status: 'completed' | 'failed';
  }): Promise<SagaState> {
    const saga = await this.getSaga(params.sagaId);
    if (!saga) throw new Error(`Saga not found: ${params.sagaId}`);

    saga.state.activityHistory[params.activityId] = {
      result: params.result,
      timestamp: new Date().toISOString(),
      status: params.status,
    };

    return await this.sagaStateRepo.save(saga);
  }

  /**
   * Get the result of a previously executed activity
   */
  async getActivity(sagaId: string, activityId: string): Promise<any | null> {
    const saga = await this.getSaga(sagaId);
    if (!saga) return null;

    return (saga.state as any).activityHistory?.[activityId] || null;
  }
}
