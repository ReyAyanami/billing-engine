import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSignedAmountToTransactionProjections1735500000000
  implements MigrationInterface
{
  name = 'AddSignedAmountToTransactionProjections1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add source_signed_amount column
    await queryRunner.addColumn(
      'transaction_projections',
      new TableColumn({
        name: 'source_signed_amount',
        type: 'numeric',
        precision: 20,
        scale: 2,
        isNullable: true,
        comment: 'Signed amount from source account perspective (usually negative)',
      }),
    );

    // Add destination_signed_amount column
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

    // Backfill existing data: calculate signed amounts from existing amount column
    // Source is debited (negative), destination is credited (positive)
    await queryRunner.query(`
      UPDATE transaction_projections
      SET 
        source_signed_amount = -amount,
        destination_signed_amount = amount
      WHERE source_account_id IS NOT NULL 
        AND destination_account_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the columns
    await queryRunner.dropColumn('transaction_projections', 'destination_signed_amount');
    await queryRunner.dropColumn('transaction_projections', 'source_signed_amount');
  }
}

