import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialDoubleEntrySchema1765110800000 implements MigrationInterface {
  name = 'InitialDoubleEntrySchema1765110800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension for UUID generation
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create currencies table
    await queryRunner.query(`
            CREATE TABLE "currencies" (
                "code" VARCHAR(10) PRIMARY KEY,
                "name" VARCHAR(100) NOT NULL,
                "type" VARCHAR(20) NOT NULL,
                "precision" INTEGER NOT NULL DEFAULT 2,
                "is_active" BOOLEAN NOT NULL DEFAULT true,
                "metadata" JSONB
            )
        `);
    await queryRunner.query(`CREATE INDEX "IDX_currencies_type" ON "currencies" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_currencies_is_active" ON "currencies" ("is_active")`);

    // Create account type enum
    await queryRunner.query(`
            CREATE TYPE "accounts_account_type_enum" AS ENUM('user', 'system', 'external')
        `);

    // Create account status enum
    await queryRunner.query(`
            CREATE TYPE "accounts_status_enum" AS ENUM('active', 'suspended', 'closed')
        `);

    // Create accounts table
    await queryRunner.query(`
            CREATE TABLE "accounts" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "owner_id" VARCHAR(255) NOT NULL,
                "owner_type" VARCHAR(50) NOT NULL,
                "account_type" "accounts_account_type_enum" NOT NULL DEFAULT 'user',
                "account_subtype" VARCHAR(50),
                "currency" VARCHAR(10) NOT NULL,
                "balance" NUMERIC(20,8) NOT NULL DEFAULT 0,
                "max_balance" NUMERIC(20,8),
                "min_balance" NUMERIC(20,8),
                "status" "accounts_status_enum" NOT NULL DEFAULT 'active',
                "metadata" JSONB,
                "version" INTEGER NOT NULL DEFAULT 1,
                "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT "FK_accounts_currency" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "CHK_balance_non_negative" CHECK ("balance" >= 0),
                CONSTRAINT "CHK_max_balance_positive" CHECK ("max_balance" IS NULL OR "max_balance" > 0),
                CONSTRAINT "CHK_min_balance_non_negative" CHECK ("min_balance" IS NULL OR "min_balance" >= 0)
            )
        `);
    await queryRunner.query(`CREATE INDEX "IDX_accounts_owner" ON "accounts" ("owner_id", "owner_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_accounts_account_type" ON "accounts" ("account_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_accounts_status" ON "accounts" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_accounts_created_at" ON "accounts" ("created_at")`);

    // Create transaction type enum
    await queryRunner.query(`
            CREATE TYPE "transactions_type_enum" AS ENUM('topup', 'withdrawal', 'transfer_debit', 'transfer_credit', 'payment', 'refund', 'cancellation')
        `);

    // Create transaction status enum
    await queryRunner.query(`
            CREATE TYPE "transactions_status_enum" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded')
        `);

    // Create transactions table
    await queryRunner.query(`
            CREATE TABLE "transactions" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "idempotency_key" UUID UNIQUE NOT NULL,
                "type" "transactions_type_enum" NOT NULL,
                "source_account_id" UUID NOT NULL,
                "destination_account_id" UUID NOT NULL,
                "amount" NUMERIC(20,8) NOT NULL,
                "currency" VARCHAR(10) NOT NULL,
                "source_balance_before" NUMERIC(20,8) NOT NULL,
                "source_balance_after" NUMERIC(20,8) NOT NULL,
                "destination_balance_before" NUMERIC(20,8) NOT NULL,
                "destination_balance_after" NUMERIC(20,8) NOT NULL,
                "status" "transactions_status_enum" NOT NULL DEFAULT 'pending',
                "reference" VARCHAR(500),
                "metadata" JSONB,
                "parent_transaction_id" UUID,
                "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "completed_at" TIMESTAMP,
                CONSTRAINT "FK_transactions_source" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "FK_transactions_destination" FOREIGN KEY ("destination_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "FK_transactions_parent" FOREIGN KEY ("parent_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "CHK_amount_positive" CHECK ("amount" > 0),
                CONSTRAINT "CHK_not_self_transfer" CHECK ("source_account_id" != "destination_account_id")
            )
        `);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_source_created" ON "transactions" ("source_account_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_destination_created" ON "transactions" ("destination_account_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_idempotency" ON "transactions" ("idempotency_key")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_status" ON "transactions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_type" ON "transactions" ("type")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_created_at" ON "transactions" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_parent" ON "transactions" ("parent_transaction_id")`);

    // Create audit_logs table
    await queryRunner.query(`
            CREATE TABLE "audit_logs" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "entity_type" VARCHAR(50) NOT NULL,
                "entity_id" VARCHAR(255) NOT NULL,
                "operation" VARCHAR(50) NOT NULL,
                "changes" JSONB NOT NULL,
                "actor_id" VARCHAR(255),
                "actor_type" VARCHAR(50),
                "correlation_id" VARCHAR(255) NOT NULL,
                "timestamp" TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_correlation" ON "audit_logs" ("correlation_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_timestamp" ON "audit_logs" ("timestamp")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_operation" ON "audit_logs" ("operation")`);

    // Seed initial currencies
    await queryRunner.query(`
            INSERT INTO "currencies" ("code", "name", "type", "precision", "is_active") VALUES
            ('USD', 'US Dollar', 'fiat', 2, true),
            ('EUR', 'Euro', 'fiat', 2, true),
            ('GBP', 'British Pound', 'fiat', 2, true),
            ('BTC', 'Bitcoin', 'non-fiat', 8, true),
            ('ETH', 'Ethereum', 'non-fiat', 8, true),
            ('POINTS', 'Loyalty Points', 'non-fiat', 0, true)
        `);

    // Seed system/external accounts for common use cases
    await queryRunner.query(`
            INSERT INTO "accounts" ("id", "owner_id", "owner_type", "account_type", "account_subtype", "currency", "balance", "status") VALUES
            ('00000000-0000-0000-0000-000000000001', 'system', 'system', 'external', 'bank', 'USD', 0, 'active'),
            ('00000000-0000-0000-0000-000000000002', 'system', 'system', 'external', 'bank', 'EUR', 0, 'active'),
            ('00000000-0000-0000-0000-000000000003', 'system', 'system', 'external', 'bank', 'GBP', 0, 'active'),
            ('00000000-0000-0000-0000-000000000004', 'system', 'system', 'external', 'crypto_wallet', 'BTC', 0, 'active'),
            ('00000000-0000-0000-0000-000000000005', 'system', 'system', 'external', 'crypto_wallet', 'ETH', 0, 'active'),
            ('00000000-0000-0000-0000-000000000006', 'system', 'system', 'system', 'fee_collection', 'USD', 0, 'active'),
            ('00000000-0000-0000-0000-000000000007', 'system', 'system', 'system', 'reserve', 'USD', 0, 'active')
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order due to foreign key constraints
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TYPE "transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "transactions_type_enum"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "accounts_status_enum"`);
    await queryRunner.query(`DROP TYPE "accounts_account_type_enum"`);
    await queryRunner.query(`DROP TABLE "currencies"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}

