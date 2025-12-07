import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1765108546941 implements MigrationInterface {
    name = 'InitialSchema1765108546941'

    public async up(queryRunner: QueryRunner): Promise<void> {
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

        // Create indexes for currencies
        await queryRunner.query(`CREATE INDEX "IDX_currencies_type" ON "currencies" ("type")`);
        await queryRunner.query(`CREATE INDEX "IDX_currencies_is_active" ON "currencies" ("is_active")`);

        // Create accounts table with enum type
        await queryRunner.query(`
            CREATE TYPE "accounts_status_enum" AS ENUM('active', 'suspended', 'closed')
        `);
        
        await queryRunner.query(`
            CREATE TABLE "accounts" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "owner_id" VARCHAR(255) NOT NULL,
                "owner_type" VARCHAR(50) NOT NULL,
                "currency" VARCHAR(10) NOT NULL,
                "balance" NUMERIC(20,8) NOT NULL DEFAULT 0,
                "status" "accounts_status_enum" NOT NULL DEFAULT 'active',
                "metadata" JSONB,
                "version" INTEGER NOT NULL DEFAULT 1,
                "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT "FK_accounts_currency" FOREIGN KEY ("currency") 
                    REFERENCES "currencies"("code") 
                    ON DELETE RESTRICT 
                    ON UPDATE CASCADE,
                CONSTRAINT "CHK_balance_non_negative" CHECK ("balance" >= 0)
            )
        `);

        // Create indexes for accounts
        await queryRunner.query(`CREATE INDEX "IDX_accounts_owner" ON "accounts" ("owner_id", "owner_type")`);
        await queryRunner.query(`CREATE INDEX "IDX_accounts_status" ON "accounts" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_accounts_created_at" ON "accounts" ("created_at")`);

        // Create transactions table with enum types
        await queryRunner.query(`
            CREATE TYPE "transactions_type_enum" AS ENUM('topup', 'withdrawal', 'transfer_debit', 'transfer_credit', 'payment', 'refund', 'cancellation')
        `);
        
        await queryRunner.query(`
            CREATE TYPE "transactions_status_enum" AS ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded')
        `);

        await queryRunner.query(`
            CREATE TABLE "transactions" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "idempotency_key" UUID UNIQUE NOT NULL,
                "type" "transactions_type_enum" NOT NULL,
                "account_id" UUID NOT NULL,
                "counterparty_account_id" UUID,
                "amount" NUMERIC(20,8) NOT NULL,
                "currency" VARCHAR(10) NOT NULL,
                "balance_before" NUMERIC(20,8) NOT NULL,
                "balance_after" NUMERIC(20,8) NOT NULL,
                "status" "transactions_status_enum" NOT NULL DEFAULT 'pending',
                "reference" VARCHAR(500),
                "metadata" JSONB,
                "parent_transaction_id" UUID,
                "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
                "completed_at" TIMESTAMP,
                CONSTRAINT "FK_transactions_account" FOREIGN KEY ("account_id") 
                    REFERENCES "accounts"("id") 
                    ON DELETE RESTRICT 
                    ON UPDATE CASCADE,
                CONSTRAINT "FK_transactions_counterparty" FOREIGN KEY ("counterparty_account_id") 
                    REFERENCES "accounts"("id") 
                    ON DELETE RESTRICT 
                    ON UPDATE CASCADE,
                CONSTRAINT "FK_transactions_parent" FOREIGN KEY ("parent_transaction_id") 
                    REFERENCES "transactions"("id") 
                    ON DELETE RESTRICT 
                    ON UPDATE CASCADE,
                CONSTRAINT "CHK_amount_positive" CHECK ("amount" > 0)
            )
        `);

        // Create indexes for transactions
        await queryRunner.query(`CREATE INDEX "IDX_transactions_account_created" ON "transactions" ("account_id", "created_at" DESC)`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_idempotency" ON "transactions" ("idempotency_key")`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_status" ON "transactions" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_created_at" ON "transactions" ("created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_parent" ON "transactions" ("parent_transaction_id")`);

        // Create audit_logs table
        await queryRunner.query(`
            CREATE TABLE "audit_logs" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "entity_type" VARCHAR(50) NOT NULL,
                "entity_id" UUID NOT NULL,
                "operation" VARCHAR(50) NOT NULL,
                "actor_id" VARCHAR(255),
                "actor_type" VARCHAR(50),
                "changes" JSONB NOT NULL,
                "correlation_id" UUID NOT NULL,
                "timestamp" TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

        // Create indexes for audit_logs
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_correlation" ON "audit_logs" ("correlation_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_timestamp" ON "audit_logs" ("timestamp")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_operation" ON "audit_logs" ("operation")`);

        // Insert default currencies
        await queryRunner.query(`
            INSERT INTO "currencies" ("code", "name", "type", "precision", "is_active") VALUES
            ('USD', 'US Dollar', 'fiat', 2, true),
            ('EUR', 'Euro', 'fiat', 2, true),
            ('GBP', 'British Pound', 'fiat', 2, true),
            ('BTC', 'Bitcoin', 'non-fiat', 8, true),
            ('ETH', 'Ethereum', 'non-fiat', 8, true),
            ('POINTS', 'Loyalty Points', 'non-fiat', 0, true)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order (respecting foreign key constraints)
        await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "currencies"`);

        // Drop enum types
        await queryRunner.query(`DROP TYPE IF EXISTS "transactions_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "transactions_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "accounts_status_enum"`);
    }

}
