import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionProjections1765127268345 implements MigrationInterface {
  name = 'AddTransactionProjections1765127268345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_projections_type_enum" AS ENUM('topup', 'withdrawal', 'transfer_debit', 'transfer_credit', 'payment', 'refund', 'cancellation')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_projections_status_enum" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transaction_projections" ("id" uuid NOT NULL, "type" "public"."transaction_projections_type_enum" NOT NULL, "status" "public"."transaction_projections_status_enum" NOT NULL, "amount" numeric(20,2) NOT NULL, "currency" character varying(3) NOT NULL, "source_account_id" uuid, "destination_account_id" uuid, "idempotency_key" character varying(255) NOT NULL, "correlation_id" uuid, "failure_reason" text, "failure_code" character varying(100), "source_new_balance" numeric(20,2), "destination_new_balance" numeric(20,2), "source_signed_amount" numeric(20,2), "destination_signed_amount" numeric(20,2), "requested_at" TIMESTAMP NOT NULL DEFAULT now(), "completed_at" TIMESTAMP, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "aggregate_version" integer NOT NULL DEFAULT '0', "last_event_id" uuid, "last_event_timestamp" TIMESTAMP, "metadata" jsonb, CONSTRAINT "UQ_d3c5cf5ff07ebaff5de46bec779" UNIQUE ("idempotency_key"), CONSTRAINT "PK_ef7c0a11c150ced53882aa779d8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d50b9168447caf89fa66683f93" ON "transaction_projections" ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9e305b76a0e8e3c02f4eb0e1dc" ON "transaction_projections" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_55595ccb31d0e4e16d3d0e4743" ON "transaction_projections" ("source_account_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4773207962f2c7f8964b0a15de" ON "transaction_projections" ("destination_account_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3c5cf5ff07ebaff5de46bec77" ON "transaction_projections" ("idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_821322ae74dfb9c115a6c44b62" ON "transaction_projections" ("correlation_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2d43c97bcae0ae981683816fe2" ON "transaction_projections" ("requested_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2d43c97bcae0ae981683816fe2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_821322ae74dfb9c115a6c44b62"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d3c5cf5ff07ebaff5de46bec77"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4773207962f2c7f8964b0a15de"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_55595ccb31d0e4e16d3d0e4743"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9e305b76a0e8e3c02f4eb0e1dc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d50b9168447caf89fa66683f93"`,
    );
    await queryRunner.query(`DROP TABLE "transaction_projections"`);
    await queryRunner.query(
      `DROP TYPE "public"."transaction_projections_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."transaction_projections_type_enum"`,
    );
  }
}
