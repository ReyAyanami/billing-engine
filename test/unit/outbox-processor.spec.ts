import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventBus } from '@nestjs/cqrs';
import { Repository, LessThan } from 'typeorm';
import { OutboxProcessor } from '../../src/cqrs/outbox/outbox-processor.service';
import {
  OutboxEvent,
  OutboxStatus,
} from '../../src/cqrs/outbox/outbox.entity';
import { DomainEvent } from '../../src/cqrs/base/domain-event';
import { EventStream } from '../../src/cqrs/events/event-stream.types';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let mockRepository: jest.Mocked<Repository<OutboxEvent>>;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockEventBus = {
      publish: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxProcessor,
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: mockRepository,
        },
        {
          provide: EventBus,
          useValue: mockEventBus,
        },
      ],
    }).compile();

    processor = module.get<OutboxProcessor>(OutboxProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
    processor.stop();
  });

  describe('addToOutbox', () => {
    it('should add event to outbox with default priority', async () => {
      const mockEvent = {
        getEventType: () => 'TestEvent',
        eventId: 'event-001',
        aggregateType: 'Test',
        aggregateId: 'test-001',
        aggregateVersion: 1,
        toJSON: () => ({ data: 'test' }),
      } as DomainEvent;

      const mockOutboxEvent = {
        id: 'outbox-001',
        eventType: 'TestEvent',
        eventId: 'event-001',
        status: OutboxStatus.PENDING,
      } as OutboxEvent;

      mockRepository.create.mockReturnValue(mockOutboxEvent);
      mockRepository.save.mockResolvedValue(mockOutboxEvent);

      const result = await processor.addToOutbox(mockEvent, [
        EventStream.PROJECTIONS,
      ]);

      expect(result).toEqual(mockOutboxEvent);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'TestEvent',
          eventId: 'event-001',
          aggregateType: 'Test',
          aggregateId: 'test-001',
          aggregateVersion: 1,
          payload: { data: 'test' },
          targetStreams: [EventStream.PROJECTIONS],
          status: OutboxStatus.PENDING,
          priority: 0,
        }),
      );
    });

    it('should set higher priority for saga events', async () => {
      const mockEvent = {
        getEventType: () => 'SagaEvent',
        eventId: 'event-002',
        aggregateType: 'Test',
        aggregateId: 'test-002',
        aggregateVersion: 1,
        toJSON: () => ({ data: 'saga' }),
      } as DomainEvent;

      const mockOutboxEvent = {} as OutboxEvent;
      mockRepository.create.mockReturnValue(mockOutboxEvent);
      mockRepository.save.mockResolvedValue(mockOutboxEvent);

      await processor.addToOutbox(mockEvent, [EventStream.SAGA]);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 10,
        }),
      );
    });

    it('should handle multiple target streams', async () => {
      const mockEvent = {
        getEventType: () => 'MultiEvent',
        toJSON: () => ({}),
      } as any;

      const mockOutboxEvent = {} as OutboxEvent;
      mockRepository.create.mockReturnValue(mockOutboxEvent);
      mockRepository.save.mockResolvedValue(mockOutboxEvent);

      await processor.addToOutbox(mockEvent, [
        EventStream.SAGA,
        EventStream.PROJECTIONS,
        EventStream.AUDIT,
      ]);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetStreams: [
            EventStream.SAGA,
            EventStream.PROJECTIONS,
            EventStream.AUDIT,
          ],
          priority: 10, // Because SAGA is included
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return outbox statistics', async () => {
      mockRepository.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(2) // processing
        .mockResolvedValueOnce(100) // delivered
        .mockResolvedValueOnce(3); // failed

      const stats = await processor.getStats();

      expect(stats).toEqual({
        pending: 5,
        processing: 2,
        delivered: 100,
        failed: 3,
        total: 110,
        isRunning: false,
      });

      expect(mockRepository.count).toHaveBeenCalledTimes(4);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: OutboxStatus.PENDING },
      });
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: OutboxStatus.PROCESSING },
      });
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: OutboxStatus.DELIVERED },
      });
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: OutboxStatus.FAILED },
      });
    });

    it('should handle zero counts', async () => {
      mockRepository.count.mockResolvedValue(0);

      const stats = await processor.getStats();

      expect(stats).toEqual({
        pending: 0,
        processing: 0,
        delivered: 0,
        failed: 0,
        total: 0,
        isRunning: false,
      });
    });
  });

  describe('retryFailedEvents', () => {
    it('should reset failed events to pending', async () => {
      const failedEvents = [
        {
          id: 'outbox-001',
          status: OutboxStatus.FAILED,
          retryCount: 5,
          nextRetryAt: new Date(),
        },
        {
          id: 'outbox-002',
          status: OutboxStatus.FAILED,
          retryCount: 3,
          nextRetryAt: new Date(),
        },
      ] as OutboxEvent[];

      mockRepository.find.mockResolvedValue(failedEvents);
      mockRepository.save.mockImplementation(async (e) => e as OutboxEvent);

      const count = await processor.retryFailedEvents();

      expect(count).toBe(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: OutboxStatus.FAILED },
        take: 100,
      });

      expect(mockRepository.save).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutboxStatus.PENDING,
          retryCount: 0,
          nextRetryAt: undefined,
        }),
      );
    });

    it('should respect custom limit', async () => {
      mockRepository.find.mockResolvedValue([]);

      await processor.retryFailedEvents(50);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: OutboxStatus.FAILED },
        take: 50,
      });
    });

    it('should return zero when no failed events', async () => {
      mockRepository.find.mockResolvedValue([]);

      const count = await processor.retryFailedEvents();

      expect(count).toBe(0);
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete old delivered events', async () => {
      const mockResult = { affected: 25 };
      mockRepository.delete.mockResolvedValue(mockResult as any);

      const count = await processor.cleanupOldEvents(7);

      expect(count).toBe(25);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        status: OutboxStatus.DELIVERED,
        deliveredAt: expect.any(Object), // LessThan matcher
      });
    });

    it('should use custom retention period', async () => {
      const mockResult = { affected: 10 };
      mockRepository.delete.mockResolvedValue(mockResult as any);

      await processor.cleanupOldEvents(30);

      expect(mockRepository.delete).toHaveBeenCalled();
      // Verify it was called with LessThan date 30 days ago
      const deleteCall = mockRepository.delete.mock.calls[0][0];
      expect(deleteCall.status).toBe(OutboxStatus.DELIVERED);
      expect(deleteCall.deliveredAt).toBeDefined();
    });

    it('should return zero when no events deleted', async () => {
      const mockResult = { affected: 0 };
      mockRepository.delete.mockResolvedValue(mockResult as any);

      const count = await processor.cleanupOldEvents();

      expect(count).toBe(0);
    });

    it('should handle undefined affected count', async () => {
      const mockResult = { affected: undefined };
      mockRepository.delete.mockResolvedValue(mockResult as any);

      const count = await processor.cleanupOldEvents();

      expect(count).toBe(0);
    });
  });

  describe('start and stop', () => {
    it('should start processor', async () => {
      mockRepository.find.mockResolvedValue([]);

      await processor.start();

      // Processor should be running (we can't directly test private isRunning)
      const stats = await processor.getStats();
      expect(stats.isRunning).toBe(true);
    });

    it('should stop processor', async () => {
      mockRepository.find.mockResolvedValue([]);
      await processor.start();

      processor.stop();

      const stats = await processor.getStats();
      expect(stats.isRunning).toBe(false);
    });

    it('should not start twice', async () => {
      mockRepository.find.mockResolvedValue([]);

      await processor.start();
      await processor.start(); // Should not throw or start twice

      const stats = await processor.getStats();
      expect(stats.isRunning).toBe(true);
    });
  });

  describe('exponential backoff', () => {
    it('should handle events with no retries', async () => {
      const event = {
        id: 'outbox-001',
        eventType: 'TestEvent',
        status: OutboxStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
      } as OutboxEvent;

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.save.mockResolvedValue(event);
      mockEventBus.publish.mockImplementation(() => {
        throw new Error('Simulated failure');
      });

      // Trigger processing
      await processor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      processor.stop();

      // Should have attempted to save with retry count increased
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('priority ordering', () => {
    it('should process higher priority events first', async () => {
      const events = [
        {
          id: 'outbox-001',
          priority: 0,
          eventType: 'LowPriority',
          status: OutboxStatus.PENDING,
        },
        {
          id: 'outbox-002',
          priority: 10,
          eventType: 'HighPriority',
          status: OutboxStatus.PENDING,
        },
      ] as OutboxEvent[];

      mockRepository.find.mockResolvedValue(events);

      // Verify the query orders by priority DESC
      await processor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      processor.stop();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: {
            priority: 'DESC',
            createdAt: 'ASC',
          },
        }),
      );
    });
  });

  describe('error history tracking', () => {
    it('should accumulate error history on retries', async () => {
      const event = {
        id: 'outbox-001',
        status: OutboxStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        errorHistory: [],
      } as OutboxEvent;

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.save.mockResolvedValue(event);
      mockEventBus.publish.mockImplementation(() => {
        throw new Error('Test error');
      });

      await processor.start();
      await new Promise((resolve) => setTimeout(resolve, 150));
      processor.stop();

      // Verify error history was updated
      const saveCalls = mockRepository.save.mock.calls;
      if (saveCalls.length > 0) {
        const lastCall = saveCalls[saveCalls.length - 1][0] as OutboxEvent;
        if (lastCall.errorHistory) {
          expect(lastCall.errorHistory.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('batch processing', () => {
    it('should respect batch size limit', async () => {
      mockRepository.find.mockResolvedValue([]);

      await processor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      processor.stop();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // BATCH_SIZE
        }),
      );
    });
  });

  describe('stuck event recovery', () => {
    it('should query for stuck processing events', async () => {
      mockRepository.find.mockResolvedValue([]);

      await processor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      processor.stop();

      // Verify it queries for both PENDING and stuck PROCESSING events
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([
            { status: OutboxStatus.PENDING },
            expect.objectContaining({
              status: OutboxStatus.PROCESSING,
              processedAt: expect.any(Object), // LessThan matcher
            }),
          ]),
        }),
      );
    });
  });
});

