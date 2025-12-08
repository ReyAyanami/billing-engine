/**
 * Test Setup - Full Schema Isolation for Parallel Tests
 *
 * Each test suite runs in its own PostgreSQL schema for true isolation.
 * Schema is created from scratch and torn down after tests complete.
 *
 * Benefits:
 * - True parallel execution (no database contention)
 * - Each worker has isolated data
 * - TypeORM synchronize recreates all tables automatically
 * - Clean slate for every test suite
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppTestModule } from '../../app-test.module';

export class TestSetup {
  private app!: INestApplication;
  private dataSource!: DataSource;
  private moduleRef!: TestingModule;
  private schemaName!: string;
  private originalSchema: string = 'public';

  /**
   * Initialize the test application with isolated schema
   * Call this in beforeAll()
   */
  async beforeAll(): Promise<INestApplication> {
    // Generate unique schema name based on worker ID and timestamp
    const workerId = process.env.JEST_WORKER_ID || '1';
    const timestamp = Date.now();
    this.schemaName = `test_w${workerId}_${timestamp}`;

    console.log(
      `[Worker ${workerId}] Creating isolated schema: ${this.schemaName}`,
    );

    // Create testing module
    this.moduleRef = await Test.createTestingModule({
      imports: [AppTestModule],
    }).compile();

    // Create and initialize app
    this.app = this.moduleRef.createNestApplication();
    await this.app.init();

    // Get database connection
    this.dataSource = this.app.get(DataSource);

    // Create dedicated schema and switch to it
    await this.createIsolatedSchema();

    console.log(
      `[Worker ${workerId}] Schema ${this.schemaName} ready with all tables`,
    );

    return this.app;
  }

  /**
   * Clean up after all tests - Drop the entire schema
   * Call this in afterAll()
   */
  async afterAll(): Promise<void> {
    if (this.dataSource && this.schemaName) {
      try {
        const workerId = process.env.JEST_WORKER_ID || '1';
        console.log(`[Worker ${workerId}] Dropping schema: ${this.schemaName}`);

        // Switch back to public schema
        await this.dataSource.query(
          `SET search_path TO ${this.originalSchema};`,
        );

        // Drop the test schema (CASCADE removes all objects)
        await this.dataSource.query(
          `DROP SCHEMA IF EXISTS "${this.schemaName}" CASCADE;`,
        );

        console.log(
          `[Worker ${workerId}] Schema ${this.schemaName} dropped successfully`,
        );
      } catch (error) {
        console.warn(`Failed to drop schema ${this.schemaName}:`, error);
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
    // Longer delay for parallel mode where multiple workers compete for CPU
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clean database for test isolation
    await this.cleanDatabase();
  }

  /**
   * Optional cleanup after each test
   * Call this in afterEach()
   */
  async afterEach(): Promise<void> {
    // Wait for async event processing to complete
    // Longer delay ensures all sagas finish before next test
    await new Promise((resolve) => setTimeout(resolve, 100));
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
   * Create an isolated schema and recreate all tables
   */
  private async createIsolatedSchema(): Promise<void> {
    // Create new schema
    await this.dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS "${this.schemaName}";`,
    );

    // Update connection options to use the new schema
    const options = this.dataSource.options as any;
    options.schema = this.schemaName;

    // Force TypeORM to recreate all tables in the new schema
    // dropSchema: true will clean the schema first
    await this.dataSource.synchronize(true);

    // Seed required data (currencies)
    await this.seedRequiredData();
  }

  /**
   * Seed required reference data that must exist
   */
  private async seedRequiredData(): Promise<void> {
    // Insert currencies (required for foreign key constraints)
    const currencies = [
      {
        code: 'USD',
        name: 'US Dollar',
        type: 'fiat',
        precision: 2,
        is_active: true,
      },
      {
        code: 'EUR',
        name: 'Euro',
        type: 'fiat',
        precision: 2,
        is_active: true,
      },
      {
        code: 'GBP',
        name: 'British Pound',
        type: 'fiat',
        precision: 2,
        is_active: true,
      },
      {
        code: 'BTC',
        name: 'Bitcoin',
        type: 'non-fiat',
        precision: 8,
        is_active: true,
      },
    ];

    for (const currency of currencies) {
      await this.dataSource.query(
        `INSERT INTO currencies (code, name, type, precision, is_active, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (code) DO NOTHING;`,
        [
          currency.code,
          currency.name,
          currency.type,
          currency.precision,
          currency.is_active,
          null,
        ],
      );
    }
  }

  /**
   * Clean the database by deleting all data
   * Much faster than recreating schema
   */
  private async cleanDatabase(): Promise<void> {
    try {
      // Delete in correct order (respecting foreign keys)
      await this.dataSource.query('DELETE FROM audit_logs;');
      await this.dataSource.query('DELETE FROM transaction_projections;');
      await this.dataSource.query('DELETE FROM account_projections;');
      await this.dataSource.query('DELETE FROM transactions;');
      await this.dataSource.query('DELETE FROM accounts;');
      // Don't delete currencies - they're reference data
    } catch (error) {
      console.warn('Database cleanup warning:', error);
      // Continue even if cleanup fails
    }
  }
}
