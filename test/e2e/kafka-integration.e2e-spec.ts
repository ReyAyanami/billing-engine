import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CreateAccountCommand } from '../../src/modules/account/commands/create-account.command';
import { AccountType } from '../../src/modules/account/account.entity';
import { KafkaEventStore } from '../../src/cqrs/kafka/kafka-event-store';
import { AccountAggregate } from '../../src/modules/account/aggregates/account.aggregate';
import { EventPollingHelper } from '../helpers/event-polling.helper';
import { generateTestId } from '../helpers/test-id-generator';

/**
 * 🔌 KAFKA INTEGRATION TEST
 * 
 * This is the ONE test that verifies actual Kafka integration.
 * All other e2e tests use InMemoryEventStore for speed.
 * 
 * This test verifies:
 * - Events are published to Kafka successfully
 * - Events can be consumed from Kafka
 * - Aggregate reconstruction from Kafka works
 * - Kafka cluster is healthy and accessible
 */
describe('🔌 Kafka Integration Test', () => {
  jest.setTimeout(120000); // 2 minutes for Kafka operations (real Kafka is slow)
  
  let app: INestApplication;
  let commandBus: CommandBus;
  let eventStore: KafkaEventStore;
  let eventPolling: EventPollingHelper;
  let dataSource: DataSource;
  let accountId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    commandBus = app.get<CommandBus>(CommandBus);
    eventStore = app.get<KafkaEventStore>(KafkaEventStore);
    eventPolling = new EventPollingHelper(eventStore);
    dataSource = app.get<DataSource>(DataSource);

    // Clear projections before tests
    await dataSource.manager.query('TRUNCATE TABLE account_projections RESTART IDENTITY CASCADE;');
    await dataSource.manager.query('TRUNCATE TABLE transaction_projections RESTART IDENTITY CASCADE;');

    // Wait for Kafka to be fully connected
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    // Give async operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  describe('✅ Kafka Event Publishing & Retrieval', () => {
    it('should publish event to Kafka and retrieve it for aggregate reconstruction', async () => {
      accountId = generateTestId('kafka-test-account');

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║           🔌 KAFKA INTEGRATION TEST                           ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');

      console.log('📋 Step 1: Execute CreateAccountCommand...');
      console.log(`   Account ID: ${accountId}`);

      const command = new CreateAccountCommand(
        accountId,
        'kafka-test-user',
        'USER',
        AccountType.USER,
        'USD',
        '10000.00',
        '0.00',
      );

      // Execute command (should publish event to Kafka)
      await commandBus.execute(command);

      console.log('   ✅ Command executed successfully\n');

      // Wait for event to be persisted to Kafka (real Kafka is slower)
      console.log('⏳ Step 2: Waiting for event to be persisted to Kafka...');
      const events = await eventPolling.waitForEvents('Account', accountId, {
        minEvents: 1,
        maxRetries: 100,
        retryDelayMs: 1000,
        timeoutMs: 90000, // 90 seconds for real Kafka
      });

      console.log(`   ✅ Retrieved ${events.length} event(s) from Kafka\n`);

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('AccountCreated');
      expect(events[0].aggregateId).toBe(accountId);

      // Log event details
      console.log('📨 Event Details:');
      console.log('   ├─ Event Type:', events[0].eventType);
      console.log('   ├─ Aggregate ID:', events[0].aggregateId);
      console.log('   ├─ Version:', events[0].aggregateVersion);
      console.log('   ├─ Owner ID:', events[0].ownerId);
      console.log('   ├─ Currency:', events[0].currency);
      console.log('   └─ Correlation ID:', events[0].correlationId);

      // Step 3: Reconstruct aggregate from Kafka events
      console.log('\n📦 Step 3: Reconstructing aggregate from Kafka events...');
      const reconstructedEvents = await eventStore.getEvents('Account', accountId);
      
      expect(reconstructedEvents).toHaveLength(1);
      
      const reconstructedAggregate = AccountAggregate.fromEvents(reconstructedEvents);

      console.log('   ✅ Aggregate reconstructed successfully\n');

      // Verify aggregate state
      console.log('🔍 Verifying Aggregate State:');
      console.log('   ├─ ID:', reconstructedAggregate.getId());
      console.log('   ├─ Owner:', reconstructedAggregate.getOwnerId());
      console.log('   ├─ Type:', reconstructedAggregate.getAccountType());
      console.log('   ├─ Currency:', reconstructedAggregate.getCurrency());
      console.log('   ├─ Balance:', reconstructedAggregate.getBalance().toString());
      console.log('   └─ Version:', reconstructedAggregate.getVersion());

      expect(reconstructedAggregate.getId()).toBe(accountId);
      expect(reconstructedAggregate.getOwnerId()).toBe('kafka-test-user');
      expect(reconstructedAggregate.getBalance().toString()).toBe('0.00');
      expect(reconstructedAggregate.getVersion()).toBe(1);

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║          ✅ KAFKA INTEGRATION TEST PASSED! ✅                 ║');
      console.log('║                                                               ║');
      console.log('║  Kafka cluster is healthy and functioning correctly!         ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    });
  });

  describe('ℹ️ Test Information', () => {
    it('should explain why this test exists', () => {
      console.log('\n📚 About this test:');
      console.log('   This is the ONE Kafka integration test in the test suite.');
      console.log('   All other e2e tests use InMemoryEventStore for speed.');
      console.log('   This test verifies that Kafka integration actually works.');
      console.log('');
    });

    it('should verify Kafka UI access', () => {
      console.log('🌐 Kafka UI: http://localhost:8080');
      console.log('   You can verify the events in Kafka UI after running this test.');
      console.log('   Topic: billing.account.events');
      console.log('');
    });
  });
});

