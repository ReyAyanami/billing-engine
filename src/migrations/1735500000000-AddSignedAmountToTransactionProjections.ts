import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSignedAmountToTransactionProjections1735500000000 implements MigrationInterface {
  name = 'AddSignedAmountToTransactionProjections1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists before trying to add columns
    const tableExists = await queryRunner.hasTable('transaction_projections');

    if (!tableExists) {
      console.log(
        '⚠️  Table transaction_projections does not exist yet - skipping',
      );
      return;
    }

    // Check if columns already exist (they might be in the table creation)
    const table = await queryRunner.getTable('transaction_projections');
    const hasSourceSignedAmount = table?.findColumnByName(
      'source_signed_amount',
    );
    const hasDestSignedAmount = table?.findColumnByName(
      'destination_signed_amount',
    );

    if (hasSourceSignedAmount && hasDestSignedAmount) {
      console.log('✅ Signed amount columns already exist - skipping');
      return;
    }

    // Add source_signed_amount column if it doesn't exist
    if (!hasSourceSignedAmount) {
      await queryRunner.addColumn(
        'transaction_projections',
        new TableColumn({
          name: 'source_signed_amount',
          type: 'numeric',
          precision: 20,
          scale: 2,
          isNullable: true,
          comment:
            'Signed amount from source account perspective (usually negative)',
        }),
      );
    }

    // Add destination_signed_amount column if it doesn't exist
    if (!hasDestSignedAmount) {
      await queryRunner.addColumn(
        'transaction_projections',
        new TableColumn({
          name: 'destination_signed_amount',
          type: 'numeric',
          precision: 20,
          scale: 2,
          isNullable: true,
          comment:
            'Signed amount from destination account perspective (usually positive)',
        }),
      );
    }

    // Backfill existing data: calculate signed amounts from existing amount column
    // Source is debited (negative), destination is credited (positive)
    await queryRunner.query(`
      UPDATE transaction_projections
      SET 
        source_signed_amount = -amount,
        destination_signed_amount = amount
      WHERE source_account_id IS NOT NULL 
        AND destination_account_id IS NOT NULL
        AND source_signed_amount IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the columns
    await queryRunner.dropColumn(
      'transaction_projections',
      'destination_signed_amount',
    );
    await queryRunner.dropColumn(
      'transaction_projections',
      'source_signed_amount',
    );
  }
}
