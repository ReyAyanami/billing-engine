import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Drop accounts table (move to pure event sourcing)
 *
 * Context:
 * - Removed hybrid CQRS/traditional database approach
 * - Now using pure event sourcing with AccountAggregate + AccountProjection
 * - Write model: Events in Kafka (via AccountAggregate)
 * - Read model: AccountProjection table only
 *
 * This migration drops the redundant 'accounts' table.
 * All account data is now in 'account_projections' (read model) and Kafka events (source of truth).
 */
export class DropAccountsTableEventSourced1735000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if transactions table exists before dropping constraints
    const transactionsTableExists = await queryRunner.hasTable('transactions');

    if (transactionsTableExists) {
      // Drop foreign key constraints from transactions table first
      await queryRunner.query(`
        ALTER TABLE transactions 
        DROP CONSTRAINT IF EXISTS "FK_transactions_source_account"
      `);

      await queryRunner.query(`
        ALTER TABLE transactions 
        DROP CONSTRAINT IF EXISTS "FK_transactions_destination_account"
      `);
    }

    // Drop the accounts table
    await queryRunner.query(`
      DROP TABLE IF EXISTS accounts CASCADE
    `);

    console.log('✅ Dropped accounts table - using pure event sourcing');
    console.log('   Write model: Events in Kafka');
    console.log('   Read model: account_projections table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate accounts table (for rollback purposes)
    await queryRunner.query(`
      CREATE TABLE accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id VARCHAR(255) NOT NULL,
        owner_type VARCHAR(50) NOT NULL,
        account_type VARCHAR(20) NOT NULL DEFAULT 'user',
        account_subtype VARCHAR(50),
        currency VARCHAR(10) NOT NULL,
        balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
        max_balance DECIMAL(20, 8),
        min_balance DECIMAL(20, 8),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        metadata JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "FK_accounts_currency" FOREIGN KEY (currency) 
          REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    // Recreate indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_accounts_owner_id_owner_type" ON accounts (owner_id, owner_type)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounts_status" ON accounts (status)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounts_account_type" ON accounts (account_type)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_accounts_created_at" ON accounts (created_at)
    `);

    // Recreate foreign keys in transactions table
    await queryRunner.query(`
      ALTER TABLE transactions 
      ADD CONSTRAINT "FK_transactions_source_account" 
      FOREIGN KEY (source_account_id) REFERENCES accounts(id) 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE transactions 
      ADD CONSTRAINT "FK_transactions_destination_account" 
      FOREIGN KEY (destination_account_id) REFERENCES accounts(id) 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    console.log(
      '⚠️  Rolled back to hybrid architecture - accounts table restored',
    );
    console.log('   Note: Data in accounts table will be empty after rollback');
  }
}
