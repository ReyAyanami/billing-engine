import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransactionService } from './transaction.service';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { AccountService } from '../account/account.service';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import { Account, AccountStatus, AccountType } from '../account/account.entity';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { InsufficientBalanceException, CurrencyMismatchException } from '../../common/exceptions/billing.exception';
// Pipeline imports
import { TransactionPipeline } from './pipeline/transaction-pipeline';
import {
  CheckIdempotencyStep,
  LoadAndLockAccountsStep,
  ValidateAccountsStep,
  CalculateBalancesStep,
  CreateTransactionStep,
  UpdateBalancesStep,
  CompleteTransactionStep,
  AuditLogStep,
} from './pipeline';

describe('TransactionService', () => {
  let service: TransactionService;
  let transactionRepository: Repository<Transaction>;
  let accountService: AccountService;
  let currencyService: CurrencyService;
  let auditService: AuditService;
  let dataSource: DataSource;
  let pipeline: TransactionPipeline;

  const mockContext = {
    correlationId: 'test-correlation-id',
    actorId: 'test-actor',
    actorType: 'test',
    timestamp: new Date(),
  };

  const mockUserAccount: Partial<Account> = {
    id: 'user-account-123',
    ownerId: 'user-123',
    ownerType: 'user',
    accountType: AccountType.USER,
    currency: 'USD',
    balance: '100.00',
    status: AccountStatus.ACTIVE,
  };

  const mockExternalAccount: Partial<Account> = {
    id: 'external-account-123',
    ownerId: 'bank',
    ownerType: 'bank',
    accountType: AccountType.EXTERNAL,
    currency: 'USD',
    balance: '0.00',
    status: AccountStatus.ACTIVE,
  };

  beforeEach(async () => {
    const mockEntityManager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: AccountService,
          useValue: {
            findAndLock: jest.fn(),
            validateAccountActive: jest.fn(),
            updateBalance: jest.fn(),
          },
        },
        {
          provide: CurrencyService,
          useValue: {
            validateCurrency: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((callback) => callback(mockEntityManager)),
          },
        },
        // Pipeline mocks
        {
          provide: TransactionPipeline,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: CheckIdempotencyStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: LoadAndLockAccountsStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: ValidateAccountsStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: CalculateBalancesStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: CreateTransactionStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: UpdateBalancesStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: CompleteTransactionStep,
          useValue: { execute: jest.fn() },
        },
        {
          provide: AuditLogStep,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    accountService = module.get<AccountService>(AccountService);
    currencyService = module.get<CurrencyService>(CurrencyService);
    auditService = module.get<AuditService>(AuditService);
    dataSource = module.get<DataSource>(DataSource);
    pipeline = module.get<TransactionPipeline>(TransactionPipeline);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('topup', () => {
    it('should successfully top up an account', async () => {
      const topupDto: TopupDto = {
        idempotencyKey: 'idempotency-123',
        sourceAccountId: 'external-account-123',
        destinationAccountId: 'user-account-123',
        amount: '50.00',
        currency: 'USD',
        reference: 'Test topup',
      };

      const mockTransaction: Partial<Transaction> = {
        id: 'transaction-123',
        idempotencyKey: topupDto.idempotencyKey,
        type: TransactionType.TOPUP,
        sourceAccountId: topupDto.sourceAccountId,
        destinationAccountId: topupDto.destinationAccountId,
        amount: topupDto.amount,
        currency: topupDto.currency,
        sourceBalanceBefore: '0.00',
        sourceBalanceAfter: '-50.00',
        destinationBalanceBefore: '100.00',
        destinationBalanceAfter: '150.00',
        status: TransactionStatus.COMPLETED,
        createdAt: new Date(),
      };

      // Mock pipeline execute to return expected result
      const expectedResult = {
        transactionId: mockTransaction.id,
        idempotencyKey: topupDto.idempotencyKey,
        type: TransactionType.TOPUP,
        sourceAccountId: mockTransaction.sourceAccountId,
        destinationAccountId: mockTransaction.destinationAccountId,
        amount: mockTransaction.amount,
        currency: mockTransaction.currency,
        sourceBalanceBefore: '0.00',
        sourceBalanceAfter: '-50.00',
        destinationBalanceBefore: '100.00',
        destinationBalanceAfter: '150.00',
        status: TransactionStatus.COMPLETED,
        createdAt: mockTransaction.createdAt,
      };

      jest.spyOn(pipeline, 'execute').mockResolvedValue(expectedResult);

      const result = await service.topup(topupDto, mockContext);

      expect(result).toMatchObject({
        transactionId: mockTransaction.id,
        sourceAccountId: mockTransaction.sourceAccountId,
        destinationAccountId: mockTransaction.destinationAccountId,
        amount: mockTransaction.amount,
        currency: mockTransaction.currency,
        status: mockTransaction.status,
      });
      expect(pipeline.execute).toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('should successfully withdraw from an account', async () => {
      const withdrawalDto: WithdrawalDto = {
        idempotencyKey: 'idempotency-456',
        sourceAccountId: 'user-account-123',
        destinationAccountId: 'external-account-123',
        amount: '30.00',
        currency: 'USD',
        reference: 'Test withdrawal',
      };

      const mockTransaction: Partial<Transaction> = {
        id: 'transaction-456',
        idempotencyKey: withdrawalDto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: withdrawalDto.sourceAccountId,
        destinationAccountId: withdrawalDto.destinationAccountId,
        amount: withdrawalDto.amount,
        currency: withdrawalDto.currency,
        sourceBalanceBefore: '100.00',
        sourceBalanceAfter: '70.00',
        destinationBalanceBefore: '0.00',
        destinationBalanceAfter: '30.00',
        status: TransactionStatus.COMPLETED,
        createdAt: new Date(),
      };

      // Mock pipeline execute to return expected result
      const expectedResult = {
        transactionId: mockTransaction.id,
        idempotencyKey: withdrawalDto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: mockTransaction.sourceAccountId,
        destinationAccountId: mockTransaction.destinationAccountId,
        amount: mockTransaction.amount,
        currency: mockTransaction.currency,
        sourceBalanceBefore: '100.00',
        sourceBalanceAfter: '70.00',
        destinationBalanceBefore: '0.00',
        destinationBalanceAfter: '30.00',
        status: TransactionStatus.COMPLETED,
        createdAt: mockTransaction.createdAt,
      };

      jest.spyOn(pipeline, 'execute').mockResolvedValue(expectedResult);

      const result = await service.withdraw(withdrawalDto, mockContext);

      expect(result).toMatchObject({
        transactionId: mockTransaction.id,
        sourceAccountId: mockTransaction.sourceAccountId,
        destinationAccountId: mockTransaction.destinationAccountId,
        amount: mockTransaction.amount,
        sourceBalanceAfter: '70.00',
        destinationBalanceAfter: '30.00',
      });
      expect(pipeline.execute).toHaveBeenCalled();
    });

    it('should throw InsufficientBalanceException when balance is too low', async () => {
      const withdrawalDto: WithdrawalDto = {
        idempotencyKey: 'idempotency-789',
        sourceAccountId: 'user-account-123',
        destinationAccountId: 'external-account-123',
        amount: '200.00',
        currency: 'USD',
        reference: 'Test withdrawal',
      };

      // Mock pipeline to throw InsufficientBalanceException
      jest.spyOn(pipeline, 'execute').mockRejectedValue(
        new InsufficientBalanceException('user-account-123', '100.00', '200.00'),
      );

      await expect(service.withdraw(withdrawalDto, mockContext)).rejects.toThrow(
        InsufficientBalanceException,
      );
    });
  });

  describe('findById', () => {
    it('should return a transaction by id', async () => {
      const mockTransaction: Partial<Transaction> = {
        id: 'transaction-123',
        type: TransactionType.TOPUP,
        amount: '50.00',
        status: TransactionStatus.COMPLETED,
      };

      jest.spyOn(transactionRepository, 'findOne').mockResolvedValue(mockTransaction as Transaction);

      const result = await service.findById('transaction-123');

      expect(result).toEqual(mockTransaction);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'transaction-123' },
        relations: ['sourceAccount', 'destinationAccount', 'parentTransaction'],
      });
    });
  });

  describe('findAll', () => {
    it('should return transactions for an account', async () => {
      const mockTransactions: Partial<Transaction>[] = [
        {
          id: 'transaction-1',
          sourceAccountId: 'user-account-123',
          destinationAccountId: 'external-account-123',
          type: TransactionType.TOPUP,
          amount: '50.00',
        },
        {
          id: 'transaction-2',
          sourceAccountId: 'user-account-123',
          destinationAccountId: 'external-account-123',
          type: TransactionType.WITHDRAWAL,
          amount: '30.00',
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockTransactions),
      };

      jest.spyOn(transactionRepository, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const result = await service.findAll({
        accountId: 'user-account-123',
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual(mockTransactions);
      expect(result.length).toBe(2);
      expect(mockQueryBuilder.where).toHaveBeenCalled();
    });
  });
});
