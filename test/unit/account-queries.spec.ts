import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetAccountHandler } from '../../src/modules/account/queries/handlers/get-account.handler';
import { GetAccountsByOwnerHandler } from '../../src/modules/account/queries/handlers/get-accounts-by-owner.handler';
import { GetAccountQuery } from '../../src/modules/account/queries/get-account.query';
import { GetAccountsByOwnerQuery } from '../../src/modules/account/queries/get-accounts-by-owner.query';
import { AccountProjectionService } from '../../src/modules/account/projections/account-projection.service';
import { AccountProjection } from '../../src/modules/account/projections/account-projection.entity';

describe('Account Query Handlers', () => {
  let getAccountHandler: GetAccountHandler;
  let getAccountsByOwnerHandler: GetAccountsByOwnerHandler;
  let mockProjectionService: jest.Mocked<AccountProjectionService>;

  const mockAccount: Partial<AccountProjection> = {
    id: 'acc-123',
    ownerId: 'owner-456',
    ownerType: 'user',
    accountType: 'user' as any,
    currency: 'USD',
    status: 'active' as any,
    balance: '1000.00',
  };

  beforeEach(async () => {
    mockProjectionService = {
      findById: jest.fn(),
      findByOwnerId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAccountHandler,
        GetAccountsByOwnerHandler,
        {
          provide: AccountProjectionService,
          useValue: mockProjectionService,
        },
      ],
    }).compile();

    getAccountHandler = module.get<GetAccountHandler>(GetAccountHandler);
    getAccountsByOwnerHandler = module.get<GetAccountsByOwnerHandler>(
      GetAccountsByOwnerHandler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GetAccountHandler', () => {
    describe('execute', () => {
      it('should return account when found', async () => {
        const query = new GetAccountQuery({ accountId: 'acc-123' as any });
        mockProjectionService.findById.mockResolvedValue(
          mockAccount as AccountProjection,
        );

        const result = await getAccountHandler.execute(query);

        expect(result).toEqual(mockAccount);
        expect(mockProjectionService.findById).toHaveBeenCalledWith('acc-123');
        expect(mockProjectionService.findById).toHaveBeenCalledTimes(1);
      });

      it('should throw NotFoundException when account not found', async () => {
        const query = new GetAccountQuery({ accountId: 'acc-nonexistent' as any });
        mockProjectionService.findById.mockResolvedValue(null);

        await expect(getAccountHandler.execute(query)).rejects.toThrow(
          NotFoundException,
        );
        await expect(getAccountHandler.execute(query)).rejects.toThrow(
          'Account not found: acc-nonexistent',
        );

        expect(mockProjectionService.findById).toHaveBeenCalledWith(
          'acc-nonexistent',
        );
      });

      it('should handle different account IDs', async () => {
        const accountIds = ['acc-001', 'acc-002', 'acc-003'];

        for (const id of accountIds) {
          const query = new GetAccountQuery({ accountId: id as any });
          mockProjectionService.findById.mockResolvedValue({
            ...mockAccount,
            id,
          } as AccountProjection);

          const result = await getAccountHandler.execute(query);

          expect(result.id).toBe(id);
          expect(mockProjectionService.findById).toHaveBeenCalledWith(id);
        }
      });

      it('should return account with complete data', async () => {
        const completeAccount: Partial<AccountProjection> = {
          id: 'acc-complete',
          ownerId: 'owner-001',
          ownerType: 'user',
          accountType: 'user' as any,
          currency: 'EUR',
          status: 'active' as any,
          balance: '5000.50',
          maxBalance: '10000.00',
          minBalance: '0.00',
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-15'),
        };

        const query = new GetAccountQuery({ accountId: 'acc-complete' as any });
        mockProjectionService.findById.mockResolvedValue(
          completeAccount as AccountProjection,
        );

        const result = await getAccountHandler.execute(query);

        expect(result).toEqual(completeAccount);
        expect(result.maxBalance).toBe('10000.00');
        expect(result.minBalance).toBe('0.00');
      });

      it('should return account with different statuses', async () => {
        const statuses = ['active', 'suspended', 'closed'];

        for (const status of statuses) {
          const query = new GetAccountQuery({ accountId: `acc-${status}` as any });
          mockProjectionService.findById.mockResolvedValue({
            ...mockAccount,
            id: `acc-${status}`,
            status,
          } as AccountProjection);

          const result = await getAccountHandler.execute(query);

          expect(result.status).toBe(status);
        }
      });

      it('should return account with different account types', async () => {
        const accountTypes = ['user', 'system', 'external'];

        for (const accountType of accountTypes) {
          const query = new GetAccountQuery({ accountId: `acc-${accountType}` as any });
          mockProjectionService.findById.mockResolvedValue({
            ...mockAccount,
            id: `acc-${accountType}`,
            accountType,
          } as AccountProjection);

          const result = await getAccountHandler.execute(query);

          expect(result.accountType).toBe(accountType);
        }
      });

      it('should propagate service errors', async () => {
        const query = new GetAccountQuery({ accountId: 'acc-error' as any });
        const serviceError = new Error('Database connection failed');
        mockProjectionService.findById.mockRejectedValue(serviceError);

        await expect(getAccountHandler.execute(query)).rejects.toThrow(
          'Database connection failed',
        );
      });
    });
  });

  describe('GetAccountsByOwnerHandler', () => {
    describe('execute', () => {
      it('should return accounts for owner', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-123' as any });
        const accounts = [
          { ...mockAccount, id: 'acc-001', ownerId: 'owner-123' },
          { ...mockAccount, id: 'acc-002', ownerId: 'owner-123' },
          { ...mockAccount, id: 'acc-003', ownerId: 'owner-123' },
        ] as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result).toEqual(accounts);
        expect(result.length).toBe(3);
        expect(mockProjectionService.findByOwnerId).toHaveBeenCalledWith(
          'owner-123',
        );
        expect(mockProjectionService.findByOwnerId).toHaveBeenCalledTimes(1);
      });

      it('should return empty array when no accounts found', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-empty' as any });
        mockProjectionService.findByOwnerId.mockResolvedValue([]);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result).toEqual([]);
        expect(result.length).toBe(0);
        expect(mockProjectionService.findByOwnerId).toHaveBeenCalledWith(
          'owner-empty',
        );
      });

      it('should handle single account', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-single' as any });
        const accounts = [mockAccount] as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result).toEqual(accounts);
        expect(result.length).toBe(1);
      });

      it('should handle large number of accounts', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-many' as any });
        const accounts = Array.from({ length: 50 }, (_, i) => ({
          ...mockAccount,
          id: `acc-${i}`,
          ownerId: 'owner-many',
        })) as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result.length).toBe(50);
        expect(result[0].id).toBe('acc-0');
        expect(result[49].id).toBe('acc-49');
      });

      it('should return accounts with different currencies', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-multi' as any });
        const accounts = [
          { ...mockAccount, id: 'acc-001', currency: 'USD' },
          { ...mockAccount, id: 'acc-002', currency: 'EUR' },
          { ...mockAccount, id: 'acc-003', currency: 'GBP' },
        ] as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result.length).toBe(3);
        expect(result.map((a) => a.currency)).toEqual(['USD', 'EUR', 'GBP']);
      });

      it('should return accounts with different statuses', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-mixed' as any });
        const accounts = [
          { ...mockAccount, id: 'acc-001', status: 'active' },
          { ...mockAccount, id: 'acc-002', status: 'suspended' },
          { ...mockAccount, id: 'acc-003', status: 'closed' },
        ] as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result.length).toBe(3);
        expect(result[0].status).toBe('active');
        expect(result[1].status).toBe('suspended');
        expect(result[2].status).toBe('closed');
      });

      it('should return accounts with different balances', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-balance' as any });
        const accounts = [
          { ...mockAccount, id: 'acc-001', balance: '0.00' },
          { ...mockAccount, id: 'acc-002', balance: '100.50' },
          { ...mockAccount, id: 'acc-003', balance: '10000.99' },
        ] as AccountProjection[];

        mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

        const result = await getAccountsByOwnerHandler.execute(query);

        expect(result.length).toBe(3);
        expect(result[0].balance).toBe('0.00');
        expect(result[1].balance).toBe('100.50');
        expect(result[2].balance).toBe('10000.99');
      });

      it('should handle different owner IDs', async () => {
        const ownerIds = ['owner-001', 'owner-002', 'owner-003'];

        for (const ownerId of ownerIds) {
          const query = new GetAccountsByOwnerQuery({ ownerId: ownerId as any });
          const accounts = [
            { ...mockAccount, ownerId },
          ] as AccountProjection[];

          mockProjectionService.findByOwnerId.mockResolvedValue(accounts);

          const result = await getAccountsByOwnerHandler.execute(query);

          expect(result[0].ownerId).toBe(ownerId);
          expect(mockProjectionService.findByOwnerId).toHaveBeenCalledWith(
            ownerId,
          );
        }
      });

      it('should propagate service errors', async () => {
        const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-error' as any });
        const serviceError = new Error('Database query failed');
        mockProjectionService.findByOwnerId.mockRejectedValue(serviceError);

        await expect(
          getAccountsByOwnerHandler.execute(query),
        ).rejects.toThrow('Database query failed');
      });
    });
  });

  describe('Query Objects', () => {
    it('should create GetAccountQuery with accountId', () => {
      const query = new GetAccountQuery({ accountId: 'acc-test' as any });
      expect(query.accountId).toBe('acc-test');
    });

    it('should create GetAccountsByOwnerQuery with ownerId', () => {
      const query = new GetAccountsByOwnerQuery({ ownerId: 'owner-test' as any });
      expect(query.ownerId).toBe('owner-test');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle sequence of queries for same account', async () => {
      const accountId = 'acc-sequential';
      const query = new GetAccountQuery({ accountId: accountId as any });

      mockProjectionService.findById.mockResolvedValue(
        mockAccount as AccountProjection,
      );

      // Execute same query multiple times
      const result1 = await getAccountHandler.execute(query);
      const result2 = await getAccountHandler.execute(query);
      const result3 = await getAccountHandler.execute(query);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(mockProjectionService.findById).toHaveBeenCalledTimes(3);
    });

    it('should handle queries for different owners', async () => {
      const ownerIds = ['owner-001', 'owner-002', 'owner-003'];

      for (const ownerId of ownerIds) {
        const query = new GetAccountsByOwnerQuery({ ownerId: ownerId as any });
        mockProjectionService.findByOwnerId.mockResolvedValue([
          { ...mockAccount, ownerId },
        ] as AccountProjection[]);

        const result = await getAccountsByOwnerHandler.execute(query);
        expect(result[0].ownerId).toBe(ownerId);
      }

      expect(mockProjectionService.findByOwnerId).toHaveBeenCalledTimes(3);
    });

    it('should handle account not found after multiple retries', async () => {
      const accountId = 'acc-retry';
      const query = new GetAccountQuery({ accountId: accountId as any });

      mockProjectionService.findById.mockResolvedValue(null);

      // Multiple attempts should all fail
      await expect(getAccountHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );
      await expect(getAccountHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );
      await expect(getAccountHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockProjectionService.findById).toHaveBeenCalledTimes(3);
    });
  });
});

