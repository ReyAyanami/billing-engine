/**
 * Guardrail Tests - Verify test-only modules cannot be used in production
 */

import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

describe('Guardrails: Test-Only Modules', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJestWorker = process.env.JEST_WORKER_ID;

  afterEach(() => {
    // Restore environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JEST_WORKER_ID = originalJestWorker;
  });

  describe('InMemoryEventStore', () => {
    it('should initialize successfully in test environment', async () => {
      // GIVEN: Test environment (already set by Jest)
      expect(process.env.NODE_ENV).toBe('test');

      // WHEN: InMemoryEventStore is imported
      const { InMemoryEventStore } = await import('./helpers/in-memory-event-store');

      // THEN: Should initialize without error
      const eventStore = new InMemoryEventStore();
      expect(eventStore).toBeDefined();
    });

    it('should throw error when used in production environment', async () => {
      // GIVEN: Production environment
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';

      // Suppress error logs for this test
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      // WHEN: InMemoryEventStore is imported
      // Need to clear module cache to re-import
      jest.resetModules();
      const { InMemoryEventStore } = await import('./helpers/in-memory-event-store');

      // THEN: Should throw error on instantiation
      expect(() => new InMemoryEventStore()).toThrow(
        'InMemoryEventStore cannot be used outside test environment'
      );

      jest.restoreAllMocks();
    });

    it('should throw error when NODE_ENV is development', async () => {
      // GIVEN: Development environment
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'development';

      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      // WHEN: InMemoryEventStore is imported
      jest.resetModules();
      const { InMemoryEventStore } = await import('./helpers/in-memory-event-store');

      // THEN: Should throw error
      expect(() => new InMemoryEventStore()).toThrow(
        'InMemoryEventStore cannot be used outside test environment'
      );

      jest.restoreAllMocks();
    });
  });

  describe('AppTestModule', () => {
    it('should initialize successfully in test environment', async () => {
      // GIVEN: Test environment
      expect(process.env.NODE_ENV).toBe('test');

      // WHEN: AppTestModule is imported and compiled
      jest.resetModules();
      const { AppTestModule } = await import('./app-test.module');
      
      // THEN: Should compile without error
      const moduleRef = await Test.createTestingModule({
        imports: [AppTestModule],
      }).compile();
      
      expect(moduleRef).toBeDefined();
      await moduleRef.close();
    });

    it('should throw error when used in production environment', async () => {
      // GIVEN: Production environment
      delete process.env.JEST_WORKER_ID;
      process.env.NODE_ENV = 'production';

      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      // WHEN: AppTestModule is imported and initialized
      jest.resetModules();
      const { AppTestModule } = await import('./app-test.module');

      // THEN: Should throw error during module initialization
      await expect(
        Test.createTestingModule({
          imports: [AppTestModule],
        }).compile()
      ).rejects.toThrow('AppTestModule cannot be used outside test environment');

      jest.restoreAllMocks();
    });
  });
});

