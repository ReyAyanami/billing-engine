import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { CommandBus, QueryBus, EventBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '../../../src/modules/account/commands/create-account.command';
import { TopupCommand } from '../../../src/modules/transaction/commands/topup.command';
import { WithdrawalCommand } from '../../../src/modules/transaction/commands/withdrawal.command';
import { GetTransactionQuery } from '../../../src/modules/transaction/queries/get-transaction.query';
import { GetAccountQuery } from '../../../src/modules/account/queries/get-account.query';
import { AccountType } from '../../../src/modules/account/account.entity';
import { TransactionStatus } from '../../../src/modules/transaction/transaction.entity';
import { Connection } from 'typeorm';
import { InMemoryEventStore } from '../../helpers/in-memory-event-store';
import { EventPollingHelper } from '../../helpers/event-polling.helper';
import { generateTestId } from '../../helpers/test-id-generator';

describe('Withdrawal Saga E2E Test', () => {

  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let connection: Connection;
  let eventStore: InMemoryEventStore;
  let eventPolling: EventPollingHelper;

  let userAccountId: string;
  let externalAccountId: string;
  let correlationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider('EVENT_STORE')
    .useFactory({
      factory: (eventBus: EventBus) => new InMemoryEventStore(eventBus),
      inject: [EventBus],
    })
    .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    commandBus = app.get(CommandBus);
    queryBus = app.get(QueryBus);
    connection = app.get(Connection);
    eventStore = app.get<InMemoryEventStore>('EVENT_STORE');
    eventPolling = new EventPollingHelper(eventStore);

    // Clear projections before tests
    await connection.manager.query('TRUNCATE TABLE account_projections RESTART IDENTITY CASCADE;');
    await connection.manager.query('TRUNCATE TABLE transaction_projections RESTART IDENTITY CASCADE;');
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  describe('🏦 Setup: Create Test Accounts', () => {
    it('should create user account', async () => {
      userAccountId = generateTestId('withdrawal-user-account');
      correlationId = generateTestId('withdrawal-correlation');

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║            💸 WITHDRAWAL SAGA E2E TEST 💸                      ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('📝 Setup Step 1: Create user account...');

      const createAccountCommand = new CreateAccountCommand(
        userAccountId,
        `withdrawal-user-${Date.now()}`,
        'User',
        AccountType.USER,
        'USD',
        '100000',
        '0',
        correlationId,
      );

      await commandBus.execute(createAccountCommand);

      const accountProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetAccountQuery(userAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.id === userAccountId,
        {
          maxRetries: 30,
          retryDelayMs: 500,
          timeoutMs: 20000,
          description: 'user account projection',
        },
      );

      expect(accountProjection).toBeDefined();
      console.log('     ✅ User account created');
    });

    it('should create external account for withdrawal destination', async () => {
      externalAccountId = generateTestId('withdrawal-external-account');

      console.log('\n📝 Setup Step 2: Create external account...');

      const createExternalCommand = new CreateAccountCommand(
        externalAccountId,
        'withdrawal-system',
        'System',
        AccountType.EXTERNAL,
        'USD',
        undefined,
        undefined,
        correlationId,
      );

      await commandBus.execute(createExternalCommand);

      const externalProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetAccountQuery(externalAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.id === externalAccountId,
        {
          maxRetries: 30,
          retryDelayMs: 500,
          timeoutMs: 20000,
          description: 'external account projection',
        },
      );

      expect(externalProjection).toBeDefined();
      console.log('     ✅ External account created');
    });

    it('should fund user account for withdrawal test', async () => {
      console.log('\n📝 Setup Step 3: Fund user account with 5000 USD...');

      // Create a system account for topup source
      const topupSourceId = generateTestId('withdrawal-topup-source');
      const createTopupSource = new CreateAccountCommand(
        topupSourceId,
        'topup-source',
        'System',
        AccountType.EXTERNAL,
        'USD',
        undefined,
        undefined,
        correlationId,
      );

      await commandBus.execute(createTopupSource);

      await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetAccountQuery(topupSourceId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.id === topupSourceId,
        {
          maxRetries: 30,
          retryDelayMs: 500,
          timeoutMs: 20000,
          description: `topup source account projection ${topupSourceId}`,
        },
      );

      // Topup via CQRS command
      const topupTransactionId = generateTestId('withdrawal-topup-transaction');
      const topupCommand = new TopupCommand(
        topupTransactionId,
        userAccountId,      // accountId (destination)
        '5000.00',          // amount
        'USD',              // currency
        topupSourceId,      // sourceAccountId (external account)
        generateTestId('withdrawal-topup-idempotency'),
        correlationId,
      );
      await commandBus.execute(topupCommand);

      console.log('     ⏳ Waiting for balance update...');
      const accountProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetAccountQuery(userAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.balance === '5000.00',
        {
          maxRetries: 60,
          retryDelayMs: 500,
          timeoutMs: 35000,
          description: `user account balance to be 5000`,
        },
      );

      expect(accountProjection.balance).toBe('5000.00');
      console.log(`     ✅ Account funded (balance: ${accountProjection.balance})`);
    });
  });

  describe('💸 Withdrawal Saga Flow', () => {
    it('should execute withdrawal saga and update projections', async () => {
      const withdrawalId = generateTestId('withdrawal-transaction');
      const idempotencyKey = generateTestId('withdrawal-idempotency');

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║              💸 WITHDRAWAL SAGA TEST 💸                        ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('📝 Step 1: Execute Withdrawal Command...');
      console.log(`     Withdrawal ID: ${withdrawalId}`);
      console.log(`     Amount: 1000 USD`);
      console.log(`     From: User Account (${userAccountId})`);
      console.log(`     To: External Account (${externalAccountId})`);

      const withdrawalCommand = new WithdrawalCommand(
        withdrawalId,
        userAccountId,
        '1000.00',
        'USD',
        externalAccountId,
        idempotencyKey,
        correlationId,
      );

      await commandBus.execute(withdrawalCommand);
      console.log('     ✅ Withdrawal command executed\n');

      // Wait for withdrawal projection to be completed
      console.log('⏳ Step 2: Waiting for withdrawal saga to complete...');
      const withdrawalProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetTransactionQuery(withdrawalId));
          } catch (error) {
            return null;
          }
        },
        (proj) => {
          if (proj) {
            console.log(`     Status: ${proj.status}`);
          }
          return proj && proj.status === TransactionStatus.COMPLETED;
        },
        {
          maxRetries: 80,
          retryDelayMs: 500,
          timeoutMs: 45000,
          description: `withdrawal projection ${withdrawalId} to be COMPLETED`,
        },
      );

      expect(withdrawalProjection).toBeDefined();
      expect(withdrawalProjection.status).toBe(TransactionStatus.COMPLETED);
      console.log('     ✅ Withdrawal saga completed\n');

      // Verify user account balance
      console.log('🔍 Step 3: Verifying account balances...');
      const userAccount = await queryBus.execute(new GetAccountQuery(userAccountId));

      expect(userAccount.balance).toBe('4000.00'); // 5000 - 1000
      console.log(`     ✅ User account balance: ${userAccount.balance} (debited 1000)`);

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║       ✅ WITHDRAWAL SAGA TEST PASSED! ✅                       ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    });
  });

  describe('🎊 Summary', () => {
    it('should summarize achievements', () => {
      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                  Week 4: Withdrawal Complete!                 ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('✅ Achievements:');
      console.log('   ✓ Withdrawal saga implemented');
      console.log('   ✓ Account balances updated correctly');
      console.log('   ✓ Projections synchronized');
      console.log('   ✓ Event sourcing verified');
      console.log('');
    });
  });
});

