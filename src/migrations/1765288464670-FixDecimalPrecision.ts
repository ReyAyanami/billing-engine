import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix decimal precision for all monetary fields
 *
 * Context:
 * - Initial migrations created projections with scale: 2 (2 decimal places)
 * - Tests expect scale: 8 (8 decimal places) to match the accounts/transactions tables
 * - This migration alters the columns to use 8 decimal places for consistency
 *
 * Changes:
 * - account_projections: balance, max_balance, min_balance (2 → 8)
 * - transaction_projections: amount, source_signed_amount, destination_signed_amount,
 *   source_new_balance, destination_new_balance (2 → 8)
 */
export class FixDecimalPrecision1765288464670 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix account_projections decimal precision
    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN balance TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN max_balance TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN min_balance TYPE NUMERIC(20,8)
    `);

    // Fix transaction_projections decimal precision
    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN amount TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN source_signed_amount TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN destination_signed_amount TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN source_new_balance TYPE NUMERIC(20,8)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN destination_new_balance TYPE NUMERIC(20,8)
    `);

    console.log(
      '✅ Fixed decimal precision to 8 places for all monetary fields',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to 2 decimal places
    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN balance TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN max_balance TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE account_projections 
      ALTER COLUMN min_balance TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN amount TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN source_signed_amount TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN destination_signed_amount TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN source_new_balance TYPE NUMERIC(20,2)
    `);

    await queryRunner.query(`
      ALTER TABLE transaction_projections 
      ALTER COLUMN destination_new_balance TYPE NUMERIC(20,2)
    `);

    console.log('⚠️  Reverted decimal precision to 2 places');
  }
}
