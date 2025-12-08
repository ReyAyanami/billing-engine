import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { CommandBus, QueryBus, EventBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '../../../src/modules/account/commands/create-account.command';
import { TopupCommand } from '../../../src/modules/transaction/commands/topup.command';
import { TransferCommand } from '../../../src/modules/transaction/commands/transfer.command';
import { GetTransactionQuery } from '../../../src/modules/transaction/queries/get-transaction.query';
import { GetAccountQuery } from '../../../src/modules/account/queries/get-account.query';
import { AccountType } from '../../../src/modules/account/account.entity';
import { TransactionStatus } from '../../../src/modules/transaction/transaction.entity';
import { Connection } from 'typeorm';
import { InMemoryEventStore } from '../../helpers/in-memory-event-store';
import { EventPollingHelper } from '../../helpers/event-polling.helper';
import { generateTestId } from '../../helpers/test-id-generator';

describe('Transfer Saga E2E Test', () => {
  jest.setTimeout(90000);

  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let connection: Connection;
  let eventStore: InMemoryEventStore;
  let eventPolling: EventPollingHelper;

  let sourceAccountId: string;
  let destinationAccountId: string;
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
    it('should create source account', async () => {
      sourceAccountId = generateTestId('transfer-source-account');
      correlationId = generateTestId('transfer-correlation');

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║             🔄 TRANSFER SAGA E2E TEST 🔄                       ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('📝 Setup Step 1: Create source account...');

      const createAccountCommand = new CreateAccountCommand(
        sourceAccountId,
        `transfer-source-${Date.now()}`,
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
            return await queryBus.execute(new GetAccountQuery(sourceAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.id === sourceAccountId,
        {
          maxRetries: 30,
          retryDelayMs: 500,
          timeoutMs: 20000,
          description: 'source account projection',
        },
      );

      expect(accountProjection).toBeDefined();
      console.log('     ✅ Source account created');
    });

    it('should create destination account', async () => {
      destinationAccountId = generateTestId('transfer-destination-account');

      console.log('\n📝 Setup Step 2: Create destination account...');

      const createAccountCommand = new CreateAccountCommand(
        destinationAccountId,
        `transfer-destination-${Date.now()}`,
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
            return await queryBus.execute(new GetAccountQuery(destinationAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.id === destinationAccountId,
        {
          maxRetries: 30,
          retryDelayMs: 500,
          timeoutMs: 20000,
          description: 'destination account projection',
        },
      );

      expect(accountProjection).toBeDefined();
      console.log('     ✅ Destination account created');
    });

    it('should fund source account for transfer test', async () => {
      console.log('\n📝 Setup Step 3: Fund source account with 3000 USD...');

      // Create a system account for topup source
      const topupSourceId = generateTestId('transfer-topup-source');
      const createTopupSource = new CreateAccountCommand(
        topupSourceId,
        'transfer-topup-source',
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
          description: `topup source account projection`,
        },
      );

      // Topup via CQRS command
      const topupTransactionId = generateTestId('transfer-topup-transaction');
      const topupCommand = new TopupCommand(
        topupTransactionId,
        sourceAccountId,    // accountId (destination)
        '3000.00',          // amount
        'USD',              // currency
        topupSourceId,      // sourceAccountId (external account)
        generateTestId('transfer-topup-idempotency'),
        correlationId,
      );
      await commandBus.execute(topupCommand);

      console.log('     ⏳ Waiting for balance update...');
      const accountProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetAccountQuery(sourceAccountId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.balance === '3000.00',
        {
          maxRetries: 60,
          retryDelayMs: 500,
          timeoutMs: 35000,
          description: `source account balance to be 3000`,
        },
      );

      expect(accountProjection.balance).toBe('3000.00');
      console.log(`     ✅ Source account funded (balance: ${accountProjection.balance})`);
    });
  });

  describe('🔄 Transfer Saga Flow', () => {
    it('should execute transfer saga and update projections', async () => {
      const transferId = generateTestId('transfer-transaction');
      const idempotencyKey = generateTestId('transfer-idempotency');

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║               🔄 TRANSFER SAGA TEST 🔄                         ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('📝 Step 1: Execute Transfer Command...');
      console.log(`     Transfer ID: ${transferId}`);
      console.log(`     Amount: 1500 USD`);
      console.log(`     From: Source Account (${sourceAccountId})`);
      console.log(`     To: Destination Account (${destinationAccountId})`);

      const transferCommand = new TransferCommand(
        transferId,
        sourceAccountId,
        destinationAccountId,
        '1500.00',
        'USD',
        idempotencyKey,
        correlationId,
      );

      await commandBus.execute(transferCommand);
      console.log('     ✅ Transfer command executed\n');

      // Wait for transfer projection to be completed
      console.log('⏳ Step 2: Waiting for transfer saga to complete...');
      const transferProjection = await eventPolling.waitForProjection(
        async () => {
          try {
            return await queryBus.execute(new GetTransactionQuery(transferId));
          } catch (error) {
            return null;
          }
        },
        (proj) => proj && proj.status === TransactionStatus.COMPLETED,
        {
          maxRetries: 60,
          retryDelayMs: 500,
          timeoutMs: 35000,
          description: `transfer projection ${transferId} to be COMPLETED`,
        },
      );

      expect(transferProjection).toBeDefined();
      expect(transferProjection.status).toBe(TransactionStatus.COMPLETED);
      console.log('     ✅ Transfer saga completed\n');

      // Verify account balances
      console.log('🔍 Step 3: Verifying account balances...');
      const sourceAccount = await queryBus.execute(new GetAccountQuery(sourceAccountId));
      const destinationAccount = await queryBus.execute(new GetAccountQuery(destinationAccountId));

      expect(sourceAccount.balance).toBe('1500.00'); // 3000 - 1500
      expect(destinationAccount.balance).toBe('1500.00'); // 0 + 1500

      console.log(`     ✅ Source account balance: ${sourceAccount.balance} (debited 1500)`);
      console.log(`     ✅ Destination account balance: ${destinationAccount.balance} (credited 1500)`);

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║        ✅ TRANSFER SAGA TEST PASSED! ✅                        ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    });
  });

  describe('🎊 Summary', () => {
    it('should summarize achievements', () => {
      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║                  Week 4: Transfer Complete!                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('✅ Achievements:');
      console.log('   ✓ Transfer saga implemented');
      console.log('   ✓ Account balances updated correctly');
      console.log('   ✓ Projections synchronized');
      console.log('   ✓ Event sourcing verified');
      console.log('');
    });
  });
});

