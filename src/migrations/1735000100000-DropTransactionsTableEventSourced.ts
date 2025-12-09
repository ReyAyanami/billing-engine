import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Drop transactions table (move to pure event sourcing)
 *
 * Context:
 * - Completed migration to pure event sourcing for Transaction entity
 * - Now using TransactionAggregate + TransactionProjection
 * - Write model: Events in Kafka (via TransactionAggregate)
 * - Read model: TransactionProjection table only
 *
 * This migration drops the redundant 'transactions' table.
 * All transaction data is now in 'transaction_projections' (read model) and Kafka events (source of truth).
 */
export class DropTransactionsTableEventSourced1735000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the transactions table (including self-referential foreign key)
    await queryRunner.query(`
      DROP TABLE IF EXISTS transactions CASCADE
    `);

    console.log('✅ Dropped transactions table - using pure event sourcing');
    console.log('   Write model: Events in Kafka (TransactionAggregate)');
    console.log('   Read model: transaction_projections table');
    console.log('   Deleted: 10 entity handlers (no longer needed)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate transactions table (for rollback purposes)
    await queryRunner.query(`
      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key UUID UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL,
        source_account_id UUID NOT NULL,
        destination_account_id UUID NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        source_balance_before DECIMAL(20, 8) NOT NULL,
        source_balance_after DECIMAL(20, 8) NOT NULL,
        destination_balance_before DECIMAL(20, 8) NOT NULL,
        destination_balance_after DECIMAL(20, 8) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reference VARCHAR(500),
        metadata JSONB,
        parent_transaction_id UUID,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        CONSTRAINT "FK_transactions_parent" FOREIGN KEY (parent_transaction_id)
          REFERENCES transactions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    // Recreate indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_source_account_created" 
      ON transactions (source_account_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_destination_account_created" 
      ON transactions (destination_account_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_idempotency_key" 
      ON transactions (idempotency_key)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_status" 
      ON transactions (status)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_created_at" 
      ON transactions (created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_transactions_parent_transaction_id" 
      ON transactions (parent_transaction_id)
    `);

    console.log(
      '⚠️  Rolled back to hybrid architecture - transactions table restored',
    );
    console.log(
      '   Note: Data in transactions table will be empty after rollback',
    );
    console.log('   Note: Entity handlers would need to be restored manually');
  }
}
