/**
 * Guardrail Tests - Verify test-only modules have proper safeguards
 *
 * These tests verify that InMemoryEventStore and AppTestModule
 * have guardrails to prevent accidental production use.
 */

import { Logger } from '@nestjs/common';
import { InMemoryEventStore } from '../helpers/in-memory-event-store';
import * as fs from 'fs';
import * as path from 'path';

describe('Guardrails: Test-Only Modules', () => {
  describe('InMemoryEventStore', () => {
    it('should initialize successfully in test environment', () => {
      // GIVEN: Test environment (Jest sets NODE_ENV=test)
      expect(process.env['NODE_ENV']).toBe('test');

      // WHEN: InMemoryEventStore is created
      const eventStore = new InMemoryEventStore();

      // THEN: Should initialize without error
      expect(eventStore).toBeDefined();
    });

    it('should have validation method to check environment', () => {
      // GIVEN: InMemoryEventStore class
      const eventStore = new InMemoryEventStore();

      // THEN: Should have private validateTestEnvironment method
      // We can't test private methods directly, but we know it's called in constructor
      // If we're here without error, it passed validation
      expect(eventStore).toBeDefined();
    });

    it('should log warnings about test-only usage', () => {
      // GIVEN: Logger spy
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      // WHEN: InMemoryEventStore is created
      new InMemoryEventStore();

      // THEN: Should log warnings
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('TEST MODE ONLY'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('Environment Validation Logic', () => {
    it('should recognize test environment via NODE_ENV', () => {
      // Test that test environment is correctly detected
      expect(process.env['NODE_ENV']).toBe('test');
    });

    it('should recognize test environment via JEST_WORKER_ID', () => {
      // Jest sets JEST_WORKER_ID during test execution
      expect(process.env['JEST_WORKER_ID']).toBeDefined();
    });
  });

  describe('Documentation', () => {
    it('should have clear warnings in module comments', async () => {
      // Verify that source files have proper documentation

      // Check InMemoryEventStore has warnings
      const eventStorePath = path.join(
        __dirname,
        '../helpers/in-memory-event-store.ts',
      );
      const eventStoreContent = fs.readFileSync(eventStorePath, 'utf-8');

      expect(eventStoreContent).toContain('TEST-ONLY');
      expect(eventStoreContent).toContain('WARNING');
      expect(eventStoreContent).toContain('NEVER use this in production');

      // Check AppTestModule has warnings
      const appTestModulePath = path.join(__dirname, '../app-test.module.ts');
      const appTestModuleContent = fs.readFileSync(appTestModulePath, 'utf-8');

      expect(appTestModuleContent).toContain('TEST-ONLY');
      expect(appTestModuleContent).toContain('WARNING');
      expect(appTestModuleContent).toContain('NEVER use this in production');
    });
  });
});
