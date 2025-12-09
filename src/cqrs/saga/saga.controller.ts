import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SagaCoordinator } from './saga-coordinator.service';
import { SagaState, SagaStatus } from './saga-state.entity';

/**
 * Saga State API Controller
 *
 * Provides endpoints to query saga execution status.
 * This is the primary way tests and applications should check
 * if a business process has completed.
 *
 * Key difference from transaction projections:
 * - Saga state: Immediate consistency (write model)
 * - Projections: Eventual consistency (read model)
 */
@Controller('api/v1/sagas')
export class SagaController {
  constructor(private readonly sagaCoordinator: SagaCoordinator) {}

  /**
   * Get saga by ID
   *
   * @example GET /api/v1/sagas/550e8400-e29b-41d4-a716-446655440000
   */
  @Get(':sagaId')
  @HttpCode(HttpStatus.OK)
  async getSaga(@Param('sagaId') sagaId: string): Promise<SagaState> {
    const saga = await this.sagaCoordinator.getSaga(sagaId);

    if (!saga) {
      throw new NotFoundException(`Saga not found: ${sagaId}`);
    }

    return saga;
  }

  /**
   * Get saga by correlation ID (transaction ID)
   *
   * @example GET /api/v1/sagas/by-correlation/550e8400-e29b-41d4-a716-446655440000
   */
  @Get('by-correlation/:correlationId')
  @HttpCode(HttpStatus.OK)
  async getSagaByCorrelation(
    @Param('correlationId') correlationId: string,
  ): Promise<SagaState> {
    const saga = await this.sagaCoordinator.getSagaByCorrelation(correlationId);

    if (!saga) {
      throw new NotFoundException(
        `Saga not found for correlation: ${correlationId}`,
      );
    }

    return saga;
  }

  /**
   * Get sagas by type
   *
   * @example GET /api/v1/sagas?type=topup&limit=50
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSagasByType(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ): Promise<SagaState[]> {
    const limitNum = limit ? parseInt(limit, 10) : 100;

    if (type) {
      return await this.sagaCoordinator.getSagasByType(type, limitNum);
    }

    // If no type specified, return pending sagas
    return await this.sagaCoordinator.getPendingSagas(limitNum);
  }

  /**
   * Check if saga is complete
   *
   * @example GET /api/v1/sagas/550e8400-e29b-41d4-a716-446655440000/complete
   * @returns { complete: boolean, status: string }
   */
  @Get(':sagaId/complete')
  @HttpCode(HttpStatus.OK)
  async isSagaComplete(
    @Param('sagaId') sagaId: string,
  ): Promise<{ complete: boolean; status: SagaStatus }> {
    const saga = await this.sagaCoordinator.getSaga(sagaId);

    if (!saga) {
      throw new NotFoundException(`Saga not found: ${sagaId}`);
    }

    const isComplete =
      saga.status === SagaStatus.COMPLETED ||
      saga.status === SagaStatus.FAILED ||
      saga.status === SagaStatus.CANCELLED;

    return {
      complete: isComplete,
      status: saga.status,
    };
  }
}
