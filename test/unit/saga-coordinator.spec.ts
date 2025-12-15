import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SagaCoordinator } from '../../src/cqrs/saga/saga-coordinator.service';
import {
  SagaState,
  SagaStatus,
} from '../../src/cqrs/saga/saga-state.entity';

describe('SagaCoordinator', () => {
  let coordinator: SagaCoordinator;
  let mockRepository: jest.Mocked<Repository<SagaState>>;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SagaCoordinator,
        {
          provide: getRepositoryToken(SagaState),
          useValue: mockRepository,
        },
      ],
    }).compile();

    coordinator = module.get<SagaCoordinator>(SagaCoordinator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startSaga', () => {
    it('should create and save a new saga', async () => {
      const params = {
        sagaId: 'saga-001',
        sagaType: 'PaymentSaga',
        correlationId: 'corr-001',
        steps: ['debit-customer', 'credit-merchant', 'notify'],
      };

      const mockSaga = {
        sagaId: params.sagaId,
        sagaType: params.sagaType,
        correlationId: params.correlationId,
        status: SagaStatus.PROCESSING,
        state: {
          currentStep: 1,
          totalSteps: 3,
          completedSteps: [],
          pendingSteps: params.steps,
          compensationActions: [],
        },
      } as SagaState;

      mockRepository.create.mockReturnValue(mockSaga);
      mockRepository.save.mockResolvedValue(mockSaga);

      const result = await coordinator.startSaga(params);

      expect(result).toEqual(mockSaga);
      expect(mockRepository.create).toHaveBeenCalledWith({
        sagaId: params.sagaId,
        sagaType: params.sagaType,
        correlationId: params.correlationId,
        status: SagaStatus.PROCESSING,
        state: {
          currentStep: 1,
          totalSteps: 3,
          completedSteps: [],
          pendingSteps: params.steps,
          compensationActions: [],
        },
        metadata: undefined,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockSaga);
    });

    it('should include metadata when provided', async () => {
      const params = {
        sagaId: 'saga-002',
        sagaType: 'RefundSaga',
        correlationId: 'corr-002',
        steps: ['step1'],
        metadata: { userId: 'user-123', reason: 'customer-request' },
      };

      const mockSaga = {
        ...params,
        status: SagaStatus.PROCESSING,
        state: {
          currentStep: 1,
          totalSteps: 1,
          completedSteps: [],
          pendingSteps: params.steps,
          compensationActions: [],
        },
      } as SagaState;

      mockRepository.create.mockReturnValue(mockSaga);
      mockRepository.save.mockResolvedValue(mockSaga);

      await coordinator.startSaga(params);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: params.metadata,
        }),
      );
    });

    it('should handle single-step saga', async () => {
      const params = {
        sagaId: 'saga-single',
        sagaType: 'SimpleSaga',
        correlationId: 'corr-single',
        steps: ['single-step'],
      };

      const mockSaga = {
        sagaId: params.sagaId,
        state: {
          currentStep: 1,
          totalSteps: 1,
          completedSteps: [],
          pendingSteps: params.steps,
          compensationActions: [],
        },
      } as SagaState;

      mockRepository.create.mockReturnValue(mockSaga);
      mockRepository.save.mockResolvedValue(mockSaga);

      const result = await coordinator.startSaga(params);

      expect(result.state.totalSteps).toBe(1);
      expect(result.state.pendingSteps).toEqual(['single-step']);
    });
  });

  describe('completeStep', () => {
    it('should mark step as completed and update state', async () => {
      const saga = {
        sagaId: 'saga-001',
        sagaType: 'PaymentSaga',
        status: SagaStatus.PROCESSING,
        state: {
          currentStep: 1,
          totalSteps: 3,
          completedSteps: [],
          pendingSteps: ['step1', 'step2', 'step3'],
          compensationActions: [],
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue({
        ...saga,
        state: {
          ...saga.state,
          currentStep: 2,
          completedSteps: ['step1'],
          pendingSteps: ['step2', 'step3'],
        },
      } as SagaState);

      const result = await coordinator.completeStep({
        sagaId: 'saga-001',
        step: 'step1',
      });

      expect(result.state.completedSteps).toContain('step1');
      expect(result.state.pendingSteps).not.toContain('step1');
      expect(result.state.currentStep).toBe(2);
    });

    it('should mark saga as completed when all steps done', async () => {
      const saga = {
        sagaId: 'saga-001',
        sagaType: 'PaymentSaga',
        status: SagaStatus.PROCESSING,
        state: {
          currentStep: 3,
          totalSteps: 3,
          completedSteps: ['step1', 'step2'],
          pendingSteps: ['step3'],
          compensationActions: [],
        },
      } as SagaState;

      const completedSaga = {
        ...saga,
        status: SagaStatus.COMPLETED,
        completedAt: new Date(),
        result: { success: true, data: { amount: 100 } },
        state: {
          ...saga.state,
          completedSteps: ['step1', 'step2', 'step3'],
          pendingSteps: [],
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue(completedSaga);

      const result = await coordinator.completeStep({
        sagaId: 'saga-001',
        step: 'step3',
        result: { amount: 100 },
      });

      expect(result.status).toBe(SagaStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
      expect(result.result).toEqual({
        success: true,
        data: { amount: 100 },
      });
      expect(result.state.pendingSteps).toHaveLength(0);
    });

    it('should throw error if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        coordinator.completeStep({
          sagaId: 'nonexistent',
          step: 'step1',
        }),
      ).rejects.toThrow('Saga not found: nonexistent');
    });
  });

  describe('failSaga', () => {
    it('should mark saga as compensating when canCompensate is true', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.PROCESSING,
        state: {
          completedSteps: ['step1'],
          pendingSteps: ['step2', 'step3'],
          compensationActions: [],
        },
      } as SagaState;

      const failedSaga = {
        ...saga,
        status: SagaStatus.COMPENSATING,
        state: {
          ...saga.state,
          failedStep: 'step2',
        },
        result: {
          success: false,
          error: {
            code: 'Error',
            message: 'Step failed',
            stack: expect.any(String),
          },
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue(failedSaga);

      const result = await coordinator.failSaga({
        sagaId: 'saga-001',
        step: 'step2',
        error: new Error('Step failed'),
        canCompensate: true,
      });

      expect(result.status).toBe(SagaStatus.COMPENSATING);
      expect(result.state.failedStep).toBe('step2');
      expect(result.result).toEqual({
        success: false,
        error: expect.objectContaining({
          message: 'Step failed',
        }),
      });
    });

    it('should mark saga as failed when canCompensate is false', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.PROCESSING,
        state: {
          completedSteps: [],
          pendingSteps: ['step1'],
          compensationActions: [],
        },
      } as SagaState;

      const failedSaga = {
        ...saga,
        status: SagaStatus.FAILED,
        completedAt: new Date(),
        state: {
          ...saga.state,
          failedStep: 'step1',
        },
        result: {
          success: false,
          error: {
            code: 'ValidationError',
            message: 'Invalid input',
            stack: expect.any(String),
          },
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue(failedSaga);

      const result = await coordinator.failSaga({
        sagaId: 'saga-001',
        step: 'step1',
        error: new Error('Invalid input'),
        canCompensate: false,
      });

      expect(result.status).toBe(SagaStatus.FAILED);
      expect(result.completedAt).toBeDefined();
    });

    it('should throw error if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        coordinator.failSaga({
          sagaId: 'nonexistent',
          step: 'step1',
          error: new Error('Test error'),
        }),
      ).rejects.toThrow('Saga not found: nonexistent');
    });
  });

  describe('recordCompensation', () => {
    it('should add compensation action to saga state', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.COMPENSATING,
        state: {
          compensationActions: [],
        },
      } as SagaState;

      const updatedSaga = {
        ...saga,
        state: {
          compensationActions: [
            {
              action: 'reverse-debit',
              timestamp: expect.any(String),
              result: 'success',
            },
          ],
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue(updatedSaga);

      const result = await coordinator.recordCompensation(
        'saga-001',
        'reverse-debit',
        'success',
      );

      expect(result.state.compensationActions).toHaveLength(1);
      expect(result.state.compensationActions[0]).toEqual({
        action: 'reverse-debit',
        timestamp: expect.any(String),
        result: 'success',
      });
    });

    it('should handle multiple compensation actions', async () => {
      const saga = {
        sagaId: 'saga-001',
        state: {
          compensationActions: [
            {
              action: 'reverse-debit',
              timestamp: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockImplementation(async (s) => s as SagaState);

      await coordinator.recordCompensation('saga-001', 'reverse-credit');

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.objectContaining({
            compensationActions: expect.arrayContaining([
              expect.objectContaining({ action: 'reverse-debit' }),
              expect.objectContaining({ action: 'reverse-credit' }),
            ]),
          }),
        }),
      );
    });

    it('should throw error if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        coordinator.recordCompensation('nonexistent', 'action'),
      ).rejects.toThrow('Saga not found: nonexistent');
    });
  });

  describe('completeCompensation', () => {
    it('should mark saga as failed after compensation', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.COMPENSATING,
        state: {
          compensationActions: [
            { action: 'reverse-step1', timestamp: '2025-01-01T00:00:00.000Z' },
          ],
        },
      } as SagaState;

      const completedSaga = {
        ...saga,
        status: SagaStatus.FAILED,
        completedAt: new Date(),
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);
      mockRepository.save.mockResolvedValue(completedSaga);

      const result = await coordinator.completeCompensation('saga-001');

      expect(result.status).toBe(SagaStatus.FAILED);
      expect(result.completedAt).toBeDefined();
    });

    it('should throw error if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        coordinator.completeCompensation('nonexistent'),
      ).rejects.toThrow('Saga not found: nonexistent');
    });
  });

  describe('getSaga', () => {
    it('should return saga by ID', async () => {
      const mockSaga = {
        sagaId: 'saga-001',
        sagaType: 'PaymentSaga',
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(mockSaga);

      const result = await coordinator.getSaga('saga-001');

      expect(result).toEqual(mockSaga);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { sagaId: 'saga-001' },
      });
    });

    it('should return null if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await coordinator.getSaga('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getSagaByCorrelation', () => {
    it('should return saga by correlation ID', async () => {
      const mockSaga = {
        sagaId: 'saga-001',
        correlationId: 'corr-001',
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(mockSaga);

      const result = await coordinator.getSagaByCorrelation('corr-001');

      expect(result).toEqual(mockSaga);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { correlationId: 'corr-001' },
      });
    });

    it('should return null if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await coordinator.getSagaByCorrelation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('isSagaComplete', () => {
    it('should return true for completed saga', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.COMPLETED,
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);

      const result = await coordinator.isSagaComplete('saga-001');

      expect(result).toBe(true);
    });

    it('should return true for failed saga', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.FAILED,
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);

      const result = await coordinator.isSagaComplete('saga-001');

      expect(result).toBe(true);
    });

    it('should return true for cancelled saga', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.CANCELLED,
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);

      const result = await coordinator.isSagaComplete('saga-001');

      expect(result).toBe(true);
    });

    it('should return false for processing saga', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.PROCESSING,
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);

      const result = await coordinator.isSagaComplete('saga-001');

      expect(result).toBe(false);
    });

    it('should return false for compensating saga', async () => {
      const saga = {
        sagaId: 'saga-001',
        status: SagaStatus.COMPENSATING,
      } as SagaState;

      mockRepository.findOne.mockResolvedValue(saga);

      const result = await coordinator.isSagaComplete('saga-001');

      expect(result).toBe(false);
    });

    it('should return false if saga not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await coordinator.isSagaComplete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getSagasByType', () => {
    it('should return sagas of specific type', async () => {
      const mockSagas = [
        { sagaId: 'saga-001', sagaType: 'PaymentSaga' },
        { sagaId: 'saga-002', sagaType: 'PaymentSaga' },
      ] as SagaState[];

      mockRepository.find.mockResolvedValue(mockSagas);

      const result = await coordinator.getSagasByType('PaymentSaga');

      expect(result).toEqual(mockSagas);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { sagaType: 'PaymentSaga' },
        order: { startedAt: 'DESC' },
        take: 100,
      });
    });

    it('should respect custom limit', async () => {
      mockRepository.find.mockResolvedValue([]);

      await coordinator.getSagasByType('RefundSaga', 50);

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should return empty array if no sagas found', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await coordinator.getSagasByType('UnknownSaga');

      expect(result).toEqual([]);
    });
  });

  describe('getPendingSagas', () => {
    it('should return sagas with pending statuses', async () => {
      const mockSagas = [
        { sagaId: 'saga-001', status: SagaStatus.PROCESSING },
        { sagaId: 'saga-002', status: SagaStatus.PENDING },
      ] as SagaState[];

      mockRepository.find.mockResolvedValue(mockSagas);

      const result = await coordinator.getPendingSagas();

      expect(result).toEqual(mockSagas);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: [
          { status: SagaStatus.PENDING },
          { status: SagaStatus.PROCESSING },
          { status: SagaStatus.COMPENSATING },
        ],
        order: { startedAt: 'ASC' },
        take: 100,
      });
    });

    it('should respect custom limit', async () => {
      mockRepository.find.mockResolvedValue([]);

      await coordinator.getPendingSagas(25);

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });
  });
});

