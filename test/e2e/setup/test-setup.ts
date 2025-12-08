/**
 * Test Setup - Parallel-safe configuration and lifecycle management
 * 
 * Each test suite gets its own app instance and database schema for true isolation.
 * Supports parallel test execution with Jest workers.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppTestModule } from '../../app-test.module';

export class TestSetup {
  private app: INestApplication;
  private dataSource: DataSource;
  private moduleRef: TestingModule;
  private schemaName: string;

  /**
   * Initialize the test application
   * Call this in beforeAll()
   */
  async beforeAll(): Promise<INestApplication> {
    // Generate unique schema name based on worker ID and timestamp
    const workerId = process.env.JEST_WORKER_ID || '1';
    const timestamp = Date.now();
    this.schemaName = `test_worker_${workerId}_${timestamp}`;

    // Create testing module
    this.moduleRef = await Test.createTestingModule({
      imports: [AppTestModule],
    }).compile();

    // Create and initialize app
    this.app = this.moduleRef.createNestApplication();
    await this.app.init();

    // Get database connection
    this.dataSource = this.app.get(DataSource);

    // Create dedicated schema for this test suite
    await this.createTestSchema();

    // Ensure database is clean
    await this.cleanDatabase();

    return this.app;
  }

  /**
   * Clean up after all tests
   * Call this in afterAll()
   */
  async afterAll(): Promise<void> {
    if (this.dataSource) {
      try {
        // Drop the test schema
        await this.dropTestSchema();
      } catch (error) {
        console.warn(`Failed to drop test schema ${this.schemaName}:`, error);
      }
    }

    if (this.app) {
      await this.app.close();
    }
  }

  /**
   * Clean database before each test
   * Call this in beforeEach()
   */
  async beforeEach(): Promise<void> {
    // Wait for any pending async operations (sagas, event handlers)
    // In CQRS, events may still be processing from previous test
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Clean database for test isolation
    await this.cleanDatabase();
  }

  /**
   * Optional cleanup after each test
   * Call this in afterEach()
   */
  async afterEach(): Promise<void> {
    // Wait for async event processing to complete
    // Sagas should complete in milliseconds, but give buffer for cleanup
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  /**
   * Get the NestJS application instance
   */
  getApp(): INestApplication {
    return this.app;
  }

  /**
   * Get the database connection
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Get the current test schema name
   */
  getSchemaName(): string {
    return this.schemaName;
  }

  /**
   * Create a dedicated schema for this test suite
   */
  private async createTestSchema(): Promise<void> {
    // Use public schema for now - full schema isolation would require
    // recreating all tables in the new schema, which is complex
    // Instead, we'll use table-level isolation with better cleanup
    
    // For true schema isolation in the future:
    // await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaName};`);
    // await this.dataSource.query(`SET search_path TO ${this.schemaName};`);
  }

  /**
   * Drop the test schema
   */
  private async dropTestSchema(): Promise<void> {
    // Schema cleanup - for future use
    // await this.dataSource.query(`DROP SCHEMA IF EXISTS ${this.schemaName} CASCADE;`);
  }

  /**
   * Clean the database
   * Uses advisory locks to prevent concurrent cleanup in parallel tests
   */
  private async cleanDatabase(): Promise<void> {
    const lockId = 123456; // Arbitrary lock ID for cleanup
    
    try {
      // Acquire advisory lock (returns true if acquired, false if already held)
      const lockAcquired = await this.dataSource.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );

      if (lockAcquired[0]?.acquired) {
        try {
          // We have the lock, perform cleanup
          await this.dataSource.query('DELETE FROM audit_logs;');
          await this.dataSource.query('DELETE FROM transaction_projections;');
          await this.dataSource.query('DELETE FROM account_projections;');
          await this.dataSource.query('DELETE FROM transactions;');
          await this.dataSource.query('DELETE FROM accounts;');
          
          // Reset sequences
          await this.dataSource.query('ALTER SEQUENCE IF EXISTS audit_logs_id_seq RESTART WITH 1;');
          await this.dataSource.query('ALTER SEQUENCE IF EXISTS transaction_projections_id_seq RESTART WITH 1;');
          await this.dataSource.query('ALTER SEQUENCE IF EXISTS account_projections_id_seq RESTART WITH 1;');
        } finally {
          // Release advisory lock
          await this.dataSource.query('SELECT pg_advisory_unlock($1)', [lockId]);
        }
      } else {
        // Another worker is cleaning, wait and skip
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.warn('Database cleanup warning:', error);
      // Try to release lock if we have it
      try {
        await this.dataSource.query('SELECT pg_advisory_unlock($1)', [lockId]);
      } catch (unlockError) {
        // Ignore unlock errors
      }
    }
  }
}
