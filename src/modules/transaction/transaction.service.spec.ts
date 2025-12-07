import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransactionService } from './transaction.service';
import { Transaction, TransactionType, TransactionStatus } from './transaction.entity';
import { AccountService } from '../account/account.service';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import { Account, AccountStatus } from '../account/account.entity';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { InsufficientBalanceException, CurrencyMismatchException } from '../../common/exceptions/billing.exception';

describe('TransactionService', () => {
  let service: TransactionService;
  let transactionRepository: Repository<Transaction>;
  let accountService: AccountService;
  let currencyService: CurrencyService;
  let auditService: AuditService;
  let dataSource: DataSource;

  const mockContext = {
    correlationId: 'test-correlation-id',
    actorId: 'test-actor',
    actorType: 'test',
    timestamp: new Date(),
  };

  const mockAccount: Partial<Account> = {
    id: 'account-123',
    ownerId: 'user-123',
    ownerType: 'user',
    currency: 'USD',
    balance: '100.00',
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
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    accountService = module.get<AccountService>(AccountService);
    currencyService = module.get<CurrencyService>(CurrencyService);
    auditService = module.get<AuditService>(AuditService);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('topup', () => {
    it('should successfully top up an account', async () => {
      const topupDto: TopupDto = {
        idempotencyKey: 'idempotency-123',
        accountId: 'account-123',
        amount: '50.00',
        currency: 'USD',
        reference: 'Test topup',
      };

      const mockTransaction: Partial<Transaction> = {
        id: 'transaction-123',
        idempotencyKey: topupDto.idempotencyKey,
        type: TransactionType.TOPUP,
        accountId: topupDto.accountId,
        amount: topupDto.amount,
        currency: topupDto.currency,
        balanceBefore: '100.00',
        balanceAfter: '150.00',
        status: TransactionStatus.COMPLETED,
        createdAt: new Date(),
      };

      jest.spyOn(accountService, 'findAndLock').mockResolvedValue(mockAccount as Account);
      jest.spyOn(accountService, 'validateAccountActive').mockImplementation(() => {});
      jest.spyOn(currencyService, 'validateCurrency').mockResolvedValue({
        code: 'USD',
        name: 'US Dollar',
        type: 'fiat',
        precision: 2,
        isActive: true,
        metadata: null,
      });
      jest.spyOn(accountService, 'updateBalance').mockResolvedValue({
        ...mockAccount,
        balance: '150.00',
      } as Account);
      jest.spyOn(auditService, 'log').mockResolvedValue(null);

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null), // No duplicate
        create: jest.fn().mockReturnValue(mockTransaction),
        save: jest.fn().mockResolvedValue(mockTransaction),
      };

      jest.spyOn(dataSource, 'transaction').mockImplementation((callback: any) =>
        callback(mockEntityManager),
      );

      const result = await service.topup(topupDto, mockContext);

      expect(result).toMatchObject({
        transactionId: mockTransaction.id,
        accountId: mockTransaction.accountId,
        amount: mockTransaction.amount,
        currency: mockTransaction.currency,
        status: mockTransaction.status,
      });
      expect(accountService.findAndLock).toHaveBeenCalled();
      expect(currencyService.validateCurrency).toHaveBeenCalledWith('USD');
    });
  });

  describe('withdraw', () => {
    it('should successfully withdraw from an account', async () => {
      const withdrawalDto: WithdrawalDto = {
        idempotencyKey: 'idempotency-456',
        accountId: 'account-123',
        amount: '30.00',
        currency: 'USD',
        reference: 'Test withdrawal',
      };

      const mockTransaction: Partial<Transaction> = {
        id: 'transaction-456',
        idempotencyKey: withdrawalDto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        accountId: withdrawalDto.accountId,
        amount: withdrawalDto.amount,
        currency: withdrawalDto.currency,
        balanceBefore: '100.00',
        balanceAfter: '70.00',
        status: TransactionStatus.COMPLETED,
        createdAt: new Date(),
      };

      jest.spyOn(accountService, 'findAndLock').mockResolvedValue(mockAccount as Account);
      jest.spyOn(accountService, 'validateAccountActive').mockImplementation(() => {});
      jest.spyOn(currencyService, 'validateCurrency').mockResolvedValue({
        code: 'USD',
        name: 'US Dollar',
        type: 'fiat',
        precision: 2,
        isActive: true,
        metadata: null,
      });
      jest.spyOn(accountService, 'updateBalance').mockResolvedValue({
        ...mockAccount,
        balance: '70.00',
      } as Account);
      jest.spyOn(auditService, 'log').mockResolvedValue(null);

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(mockTransaction),
        save: jest.fn().mockResolvedValue(mockTransaction),
      };

      jest.spyOn(dataSource, 'transaction').mockImplementation((callback: any) =>
        callback(mockEntityManager),
      );

      const result = await service.withdraw(withdrawalDto, mockContext);

      expect(result).toMatchObject({
        transactionId: mockTransaction.id,
        accountId: mockTransaction.accountId,
        amount: mockTransaction.amount,
        balanceAfter: '70.00',
      });
    });

    it('should throw InsufficientBalanceException when balance is too low', async () => {
      const withdrawalDto: WithdrawalDto = {
        idempotencyKey: 'idempotency-789',
        accountId: 'account-123',
        amount: '200.00',
        currency: 'USD',
        reference: 'Test withdrawal',
      };

      jest.spyOn(accountService, 'findAndLock').mockResolvedValue(mockAccount as Account);
      jest.spyOn(accountService, 'validateAccountActive').mockImplementation(() => {});
      jest.spyOn(currencyService, 'validateCurrency').mockResolvedValue({
        code: 'USD',
        name: 'US Dollar',
        type: 'fiat',
        precision: 2,
        isActive: true,
        metadata: null,
      });

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        save: jest.fn(),
      };

      jest.spyOn(dataSource, 'transaction').mockImplementation((callback: any) =>
        callback(mockEntityManager),
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
        relations: ['account', 'counterpartyAccount', 'parentTransaction'],
      });
    });
  });

  describe('findByAccount', () => {
    it('should return transactions for an account', async () => {
      const mockTransactions: Partial<Transaction>[] = [
        {
          id: 'transaction-1',
          accountId: 'account-123',
          type: TransactionType.TOPUP,
          amount: '50.00',
        },
        {
          id: 'transaction-2',
          accountId: 'account-123',
          type: TransactionType.WITHDRAWAL,
          amount: '30.00',
        },
      ];

      jest.spyOn(transactionRepository, 'find').mockResolvedValue(mockTransactions as Transaction[]);

      const result = await service.findByAccount('account-123', 50, 0);

      expect(result).toEqual(mockTransactions);
      expect(result.length).toBe(2);
    });
  });
});

