import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountProjections1765125360863 implements MigrationInterface {
  name = 'AddAccountProjections1765125360863';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."account_projections_account_type_enum" AS ENUM('user', 'system', 'external')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."account_projections_status_enum" AS ENUM('active', 'suspended', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "account_projections" ("id" uuid NOT NULL, "owner_id" character varying(255) NOT NULL, "owner_type" character varying(50) NOT NULL, "account_type" "public"."account_projections_account_type_enum" NOT NULL, "currency" character varying(3) NOT NULL, "status" "public"."account_projections_status_enum" NOT NULL, "balance" numeric(20,2) NOT NULL DEFAULT '0', "max_balance" numeric(20,2), "min_balance" numeric(20,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "aggregate_version" integer NOT NULL DEFAULT '0', "last_event_id" uuid, "last_event_timestamp" TIMESTAMP, CONSTRAINT "PK_d1c3f2df41414bc7adea102a997" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_972ebd45837ab1907d57ae1f84" ON "account_projections" ("account_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_894707573291862869cc009c19" ON "account_projections" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_71e13a6511568357c4ce511052" ON "account_projections" ("currency") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4bf0aff6aeb39e524b82d9ff89" ON "account_projections" ("owner_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4bf0aff6aeb39e524b82d9ff89"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_71e13a6511568357c4ce511052"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_894707573291862869cc009c19"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_972ebd45837ab1907d57ae1f84"`,
    );
    await queryRunner.query(`DROP TABLE "account_projections"`);
    await queryRunner.query(
      `DROP TYPE "public"."account_projections_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."account_projections_account_type_enum"`,
    );
  }
}
