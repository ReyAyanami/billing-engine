/**
 * Test Setup - Global configuration and lifecycle management
 * 
 * Simple setup for HTTP-based E2E tests.
 * Clean database between tests for isolation.
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppTestModule } from '../../app-test.module';

export class TestSetup {
  private static app: INestApplication;
  private static dataSource: DataSource;
  private static moduleRef: TestingModule;

  /**
   * Initialize the test application
   * Call this in beforeAll()
   */
  static async beforeAll(): Promise<INestApplication> {
    // Create testing module
    this.moduleRef = await Test.createTestingModule({
      imports: [AppTestModule],
    }).compile();

    // Create and initialize app
    this.app = this.moduleRef.createNestApplication();
    await this.app.init();

    // Get database connection
    this.dataSource = this.app.get(DataSource);

    // Ensure database is clean
    await this.cleanDatabase();

    return this.app;
  }

  /**
   * Clean up after all tests
   * Call this in afterAll()
   */
  static async afterAll(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }

  /**
   * Clean database before each test
   * Call this in beforeEach()
   */
  static async beforeEach(): Promise<void> {
    // Wait for any pending async operations (sagas, event handlers)
    // In CQRS, events may still be processing from previous test
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Clean database for test isolation
    await this.cleanDatabase();
  }

  /**
   * Optional cleanup after each test
   * Call this in afterEach()
   */
  static async afterEach(): Promise<void> {
    // Wait for async event processing to complete
    // Sagas should complete in milliseconds, but give buffer for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Get the NestJS application instance
   */
  static getApp(): INestApplication {
    return this.app;
  }

  /**
   * Get the database connection
   */
  static getDataSource(): DataSource {
    return this.dataSource;
  }

  /**
   * Clean the database
   * Used in beforeAll and afterEach for test isolation
   */
  static async cleanDatabase(): Promise<void> {
    // Clean all tables in correct order (only existing tables)
    await this.dataSource.query('TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;');
    await this.dataSource.query('TRUNCATE TABLE transaction_projections RESTART IDENTITY CASCADE;');
    await this.dataSource.query('TRUNCATE TABLE account_projections RESTART IDENTITY CASCADE;');
    await this.dataSource.query('TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;');
    await this.dataSource.query('TRUNCATE TABLE accounts RESTART IDENTITY CASCADE;');
  }
}

