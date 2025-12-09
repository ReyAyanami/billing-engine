import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSagaStateAndOutboxTables1765291007927 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create saga_states table
    await queryRunner.query(`
      CREATE TABLE saga_states (
        saga_id VARCHAR(36) PRIMARY KEY,
        saga_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        state JSONB NOT NULL,
        correlation_id VARCHAR(36) NOT NULL,
        result JSONB,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_retry_at TIMESTAMP,
        next_retry_at TIMESTAMP,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        metadata JSONB,
        
        CONSTRAINT chk_saga_status CHECK (
          status IN ('pending', 'processing', 'completed', 'compensating', 'failed', 'cancelled')
        )
      );
    `);

    // Create indexes for saga_states
    await queryRunner.query(`
      CREATE INDEX idx_saga_states_status ON saga_states(status);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_saga_states_correlation ON saga_states(correlation_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_saga_states_type_status ON saga_states(saga_type, status);
    `);

    // Create outbox_events table
    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        event_id VARCHAR(36) NOT NULL,
        aggregate_type VARCHAR(50) NOT NULL,
        aggregate_id VARCHAR(36) NOT NULL,
        aggregate_version INTEGER NOT NULL,
        payload JSONB NOT NULL,
        target_streams TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_retry_at TIMESTAMP,
        next_retry_at TIMESTAMP,
        max_retries INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        error_history JSONB,
        processed_at TIMESTAMP,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        priority INTEGER NOT NULL DEFAULT 0,
        
        CONSTRAINT chk_outbox_status CHECK (
          status IN ('pending', 'processing', 'delivered', 'failed')
        )
      );
    `);

    // Create indexes for outbox_events
    await queryRunner.query(`
      CREATE INDEX idx_outbox_status_created ON outbox_events(status, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_event_type ON outbox_events(event_type);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outbox_priority ON outbox_events(priority DESC, created_at ASC) 
      WHERE status = 'pending';
    `);

    console.log('✅ Created saga_states and outbox_events tables');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop outbox_events table
    await queryRunner.query(`DROP TABLE IF EXISTS outbox_events CASCADE;`);

    // Drop saga_states table
    await queryRunner.query(`DROP TABLE IF EXISTS saga_states CASCADE;`);

    console.log('✅ Dropped saga_states and outbox_events tables');
  }
}
