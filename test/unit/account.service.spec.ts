import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { AccountService } from '../../src/modules/account/account.service';
import { Account, AccountStatus } from '../../src/modules/account/account.entity';
import { CurrencyService } from '../../src/modules/currency/currency.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { CreateAccountDto } from '../../src/modules/account/dto/create-account.dto';
import { AccountNotFoundException, InvalidOperationException } from '../../src/common/exceptions/billing.exception';

describe('AccountService', () => {
  let service: AccountService;
  let accountRepository: Repository<Account>;
  let currencyService: CurrencyService;
  let auditService: AuditService;

  const mockContext = {
    correlationId: 'test-correlation-id',
    actorId: 'test-actor',
    actorType: 'test',
    timestamp: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(Account),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
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
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    accountRepository = module.get<Repository<Account>>(getRepositoryToken(Account));
    currencyService = module.get<CurrencyService>(CurrencyService);
    auditService = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an account successfully', async () => {
      const createAccountDto: CreateAccountDto = {
        ownerId: 'user-123',
        ownerType: 'user',
        currency: 'USD',
        metadata: { name: 'Test Account' },
      };

      const mockAccount: Partial<Account> = {
        id: 'account-123',
        ownerId: createAccountDto.ownerId,
        ownerType: createAccountDto.ownerType,
        currency: createAccountDto.currency,
        balance: '0',
        status: AccountStatus.ACTIVE,
        metadata: createAccountDto.metadata,
      };

      jest.spyOn(currencyService, 'validateCurrency').mockResolvedValue({
        code: 'USD',
        name: 'US Dollar',
        type: 'fiat',
        precision: 2,
        isActive: true,
        metadata: null,
      });

      jest.spyOn(accountRepository, 'create').mockReturnValue(mockAccount as Account);
      jest.spyOn(accountRepository, 'save').mockResolvedValue(mockAccount as Account);
      jest.spyOn(auditService, 'log').mockResolvedValue(null);

      const result = await service.create(createAccountDto, mockContext);

      expect(result).toEqual(mockAccount);
      expect(currencyService.validateCurrency).toHaveBeenCalledWith('USD');
      expect(accountRepository.create).toHaveBeenCalled();
      expect(accountRepository.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        'Account',
        mockAccount.id,
        'CREATE',
        expect.any(Object),
        mockContext,
      );
    });
  });

  describe('findById', () => {
    it('should return an account by id', async () => {
      const mockAccount: Partial<Account> = {
        id: 'account-123',
        ownerId: 'user-123',
        ownerType: 'user',
        currency: 'USD',
        balance: '100.00',
        status: AccountStatus.ACTIVE,
      };

      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(mockAccount as Account);

      const result = await service.findById('account-123');

      expect(result).toEqual(mockAccount);
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'account-123' },
        relations: ['currencyDetails'],
      });
    });

    it('should throw AccountNotFoundException if account not found', async () => {
      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(AccountNotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update account status from active to suspended', async () => {
      const mockAccount: Partial<Account> = {
        id: 'account-123',
        status: AccountStatus.ACTIVE,
      };

      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(mockAccount as Account);
      jest.spyOn(accountRepository, 'save').mockResolvedValue({
        ...mockAccount,
        status: AccountStatus.SUSPENDED,
      } as Account);
      jest.spyOn(auditService, 'log').mockResolvedValue(null);

      const result = await service.updateStatus('account-123', AccountStatus.SUSPENDED, mockContext);

      expect(result.status).toBe(AccountStatus.SUSPENDED);
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should throw error for invalid status transition', async () => {
      const mockAccount: Partial<Account> = {
        id: 'account-123',
        status: AccountStatus.CLOSED,
      };

      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(mockAccount as Account);

      await expect(
        service.updateStatus('account-123', AccountStatus.ACTIVE, mockContext),
      ).rejects.toThrow(InvalidOperationException);
    });
  });

  describe('getBalance', () => {
    it('should return account balance', async () => {
      const mockAccount: Partial<Account> = {
        id: 'account-123',
        balance: '250.50',
        currency: 'USD',
        status: AccountStatus.ACTIVE,
      };

      jest.spyOn(accountRepository, 'findOne').mockResolvedValue(mockAccount as Account);

      const result = await service.getBalance('account-123');

      expect(result).toEqual({
        balance: '250.50',
        currency: 'USD',
        status: AccountStatus.ACTIVE,
      });
    });
  });
});

