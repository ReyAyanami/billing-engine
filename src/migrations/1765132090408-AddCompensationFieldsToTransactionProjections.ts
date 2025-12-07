import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompensationFieldsToTransactionProjections1765132090408 implements MigrationInterface {
    name = 'AddCompensationFieldsToTransactionProjections1765132090408'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transaction_projections" ADD "compensated_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" ADD "compensation_reason" text`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" ADD "compensation_actions" jsonb`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_status_enum" RENAME TO "transactions_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded', 'compensated')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "public"."transactions_status_enum" USING "status"::"text"::"public"."transactions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."transaction_projections_status_enum" RENAME TO "transaction_projections_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."transaction_projections_status_enum" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded', 'compensated')`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" ALTER COLUMN "status" TYPE "public"."transaction_projections_status_enum" USING "status"::"text"::"public"."transaction_projections_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transaction_projections_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."transaction_projections_status_enum_old" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" ALTER COLUMN "status" TYPE "public"."transaction_projections_status_enum_old" USING "status"::"text"::"public"."transaction_projections_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."transaction_projections_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transaction_projections_status_enum_old" RENAME TO "transaction_projections_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum_old" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded')`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "public"."transactions_status_enum_old" USING "status"::"text"::"public"."transactions_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."transactions_status_enum_old" RENAME TO "transactions_status_enum"`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" DROP COLUMN "compensation_actions"`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" DROP COLUMN "compensation_reason"`);
        await queryRunner.query(`ALTER TABLE "transaction_projections" DROP COLUMN "compensated_at"`);
    }

}
