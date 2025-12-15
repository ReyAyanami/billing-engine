import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetTransactionHandler } from '../../src/modules/transaction/queries/handlers/get-transaction.handler';
import { GetTransactionsByAccountHandler } from '../../src/modules/transaction/queries/handlers/get-transactions-by-account.handler';
import { GetTransactionQuery } from '../../src/modules/transaction/queries/get-transaction.query';
import { GetTransactionsByAccountQuery } from '../../src/modules/transaction/queries/get-transactions-by-account.query';
import { TransactionProjectionService } from '../../src/modules/transaction/projections/transaction-projection.service';
import { TransactionProjection } from '../../src/modules/transaction/projections/transaction-projection.entity';

describe('Transaction Query Handlers', () => {
  let getTransactionHandler: GetTransactionHandler;
  let getTransactionsByAccountHandler: GetTransactionsByAccountHandler;
  let mockProjectionService: jest.Mocked<TransactionProjectionService>;

  const mockTransaction: Partial<TransactionProjection> = {
    id: 'tx-123',
    type: 'payment' as any,
    status: 'completed' as any,
    amount: '100.00',
    currency: 'USD',
    sourceAccountId: 'acc-source',
    destinationAccountId: 'acc-dest',
    idempotencyKey: 'idem-123',
    correlationId: 'corr-123',
  };

  beforeEach(async () => {
    mockProjectionService = {
      findById: jest.fn(),
      findByAccount: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetTransactionHandler,
        GetTransactionsByAccountHandler,
        {
          provide: TransactionProjectionService,
          useValue: mockProjectionService,
        },
      ],
    }).compile();

    getTransactionHandler = module.get<GetTransactionHandler>(
      GetTransactionHandler,
    );
    getTransactionsByAccountHandler =
      module.get<GetTransactionsByAccountHandler>(
        GetTransactionsByAccountHandler,
      );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GetTransactionHandler', () => {
    describe('execute', () => {
      it('should return transaction when found', async () => {
        const query = new GetTransactionQuery({ transactionId: 'tx-123' as any });
        mockProjectionService.findById.mockResolvedValue(
          mockTransaction as TransactionProjection,
        );

        const result = await getTransactionHandler.execute(query);

        expect(result).toEqual(mockTransaction);
        expect(mockProjectionService.findById).toHaveBeenCalledWith('tx-123');
        expect(mockProjectionService.findById).toHaveBeenCalledTimes(1);
      });

      it('should throw NotFoundException when transaction not found', async () => {
        const query = new GetTransactionQuery({ transactionId: 'tx-nonexistent' as any });
        mockProjectionService.findById.mockResolvedValue(null);

        await expect(getTransactionHandler.execute(query)).rejects.toThrow(
          NotFoundException,
        );
        await expect(getTransactionHandler.execute(query)).rejects.toThrow(
          'Transaction not found: tx-nonexistent',
        );

        expect(mockProjectionService.findById).toHaveBeenCalledWith(
          'tx-nonexistent',
        );
      });

      it('should handle different transaction IDs', async () => {
        const transactionIds = ['tx-001', 'tx-002', 'tx-003'];

        for (const id of transactionIds) {
          const query = new GetTransactionQuery({ transactionId: id as any });
          mockProjectionService.findById.mockResolvedValue({
            ...mockTransaction,
            id,
          } as TransactionProjection);

          const result = await getTransactionHandler.execute(query);

          expect(result.id).toBe(id);
          expect(mockProjectionService.findById).toHaveBeenCalledWith(id);
        }
      });

      it('should return transaction with complete data', async () => {
        const completeTransaction: Partial<TransactionProjection> = {
          id: 'tx-complete',
          type: 'transfer' as any,
          status: 'completed' as any,
          amount: '500.50',
          currency: 'EUR',
          sourceAccountId: 'acc-001',
          destinationAccountId: 'acc-002',
          idempotencyKey: 'idem-complete',
          correlationId: 'corr-complete',
          sourceNewBalance: '1000.00',
          destinationNewBalance: '2000.00',
          sourceSignedAmount: '-500.50',
          destinationSignedAmount: '500.50',
          metadata: { orderId: '12345' },
        };

        const query = new GetTransactionQuery({ transactionId: 'tx-complete' as any });
        mockProjectionService.findById.mockResolvedValue(
          completeTransaction as TransactionProjection,
        );

        const result = await getTransactionHandler.execute(query);

        expect(result).toEqual(completeTransaction);
        expect(result.metadata).toEqual({ orderId: '12345' });
      });

      it('should propagate service errors', async () => {
        const query = new GetTransactionQuery({ transactionId: 'tx-error' as any });
        const serviceError = new Error('Database connection failed');
        mockProjectionService.findById.mockRejectedValue(serviceError);

        await expect(getTransactionHandler.execute(query)).rejects.toThrow(
          'Database connection failed',
        );
      });
    });
  });

  describe('GetTransactionsByAccountHandler', () => {
    describe('execute', () => {
      it('should return transactions for account', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-123' as any });
        const transactions = [
          { ...mockTransaction, id: 'tx-001' },
          { ...mockTransaction, id: 'tx-002' },
          { ...mockTransaction, id: 'tx-003' },
        ] as TransactionProjection[];

        mockProjectionService.findByAccount.mockResolvedValue(transactions);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result).toEqual(transactions);
        expect(result.length).toBe(3);
        expect(mockProjectionService.findByAccount).toHaveBeenCalledWith(
          'acc-123',
        );
        expect(mockProjectionService.findByAccount).toHaveBeenCalledTimes(1);
      });

      it('should return empty array when no transactions found', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-empty' as any });
        mockProjectionService.findByAccount.mockResolvedValue([]);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result).toEqual([]);
        expect(result.length).toBe(0);
        expect(mockProjectionService.findByAccount).toHaveBeenCalledWith(
          'acc-empty',
        );
      });

      it('should handle single transaction', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-single' as any });
        const transactions = [mockTransaction] as TransactionProjection[];

        mockProjectionService.findByAccount.mockResolvedValue(transactions);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result).toEqual(transactions);
        expect(result.length).toBe(1);
      });

      it('should handle large number of transactions', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-many' as any });
        const transactions = Array.from({ length: 100 }, (_, i) => ({
          ...mockTransaction,
          id: `tx-${i}`,
        })) as TransactionProjection[];

        mockProjectionService.findByAccount.mockResolvedValue(transactions);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result.length).toBe(100);
        expect(result[0].id).toBe('tx-0');
        expect(result[99].id).toBe('tx-99');
      });

      it('should return transactions with different statuses', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-mixed' as any });
        const transactions = [
          { ...mockTransaction, id: 'tx-001', status: 'pending' },
          { ...mockTransaction, id: 'tx-002', status: 'completed' },
          { ...mockTransaction, id: 'tx-003', status: 'failed' },
        ] as TransactionProjection[];

        mockProjectionService.findByAccount.mockResolvedValue(transactions);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result.length).toBe(3);
        expect(result[0].status).toBe('pending');
        expect(result[1].status).toBe('completed');
        expect(result[2].status).toBe('failed');
      });

      it('should return transactions with different types', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-types' as any });
        const transactions = [
          { ...mockTransaction, id: 'tx-001', type: 'payment' },
          { ...mockTransaction, id: 'tx-002', type: 'refund' },
          { ...mockTransaction, id: 'tx-003', type: 'topup' },
          { ...mockTransaction, id: 'tx-004', type: 'withdrawal' },
          { ...mockTransaction, id: 'tx-005', type: 'transfer_debit' },
        ] as TransactionProjection[];

        mockProjectionService.findByAccount.mockResolvedValue(transactions);

        const result = await getTransactionsByAccountHandler.execute(query);

        expect(result.length).toBe(5);
        expect(result.map((t) => t.type)).toEqual([
          'payment',
          'refund',
          'topup',
          'withdrawal',
          'transfer_debit',
        ]);
      });

      it('should handle different account IDs', async () => {
        const accountIds = ['acc-001', 'acc-002', 'acc-003'];

        for (const accountId of accountIds) {
          const query = new GetTransactionsByAccountQuery({ accountId: accountId as any });
          const transactions = [
            { ...mockTransaction, sourceAccountId: accountId },
          ] as TransactionProjection[];

          mockProjectionService.findByAccount.mockResolvedValue(transactions);

          const result = await getTransactionsByAccountHandler.execute(query);

          expect(result[0].sourceAccountId).toBe(accountId);
          expect(mockProjectionService.findByAccount).toHaveBeenCalledWith(
            accountId,
          );
        }
      });

      it('should propagate service errors', async () => {
        const query = new GetTransactionsByAccountQuery({ accountId: 'acc-error' as any });
        const serviceError = new Error('Database query failed');
        mockProjectionService.findByAccount.mockRejectedValue(serviceError);

        await expect(
          getTransactionsByAccountHandler.execute(query),
        ).rejects.toThrow('Database query failed');
      });
    });
  });

  describe('Query Objects', () => {
    it('should create GetTransactionQuery with transactionId', () => {
      const query = new GetTransactionQuery({ transactionId: 'tx-test' as any });
      expect(query.transactionId).toBe('tx-test');
    });

    it('should create GetTransactionsByAccountQuery with accountId', () => {
      const query = new GetTransactionsByAccountQuery({ accountId: 'acc-test' as any });
      expect(query.accountId).toBe('acc-test');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle sequence of queries for same transaction', async () => {
      const transactionId = 'tx-sequential';
      const query = new GetTransactionQuery({ transactionId: transactionId as any });

      mockProjectionService.findById.mockResolvedValue(
        mockTransaction as TransactionProjection,
      );

      // Execute same query multiple times
      const result1 = await getTransactionHandler.execute(query);
      const result2 = await getTransactionHandler.execute(query);
      const result3 = await getTransactionHandler.execute(query);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(mockProjectionService.findById).toHaveBeenCalledTimes(3);
    });

    it('should handle queries for different accounts', async () => {
      const accountIds = ['acc-001', 'acc-002', 'acc-003'];

      for (const accountId of accountIds) {
        const query = new GetTransactionsByAccountQuery({ accountId: accountId as any });
        mockProjectionService.findByAccount.mockResolvedValue([
          { ...mockTransaction, sourceAccountId: accountId },
        ] as TransactionProjection[]);

        const result = await getTransactionsByAccountHandler.execute(query);
        expect(result[0].sourceAccountId).toBe(accountId);
      }

      expect(mockProjectionService.findByAccount).toHaveBeenCalledTimes(3);
    });

    it('should handle transaction not found after multiple retries', async () => {
      const transactionId = 'tx-retry';
      const query = new GetTransactionQuery({ transactionId: transactionId as any });

      mockProjectionService.findById.mockResolvedValue(null);

      // Multiple attempts should all fail
      await expect(getTransactionHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );
      await expect(getTransactionHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );
      await expect(getTransactionHandler.execute(query)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockProjectionService.findById).toHaveBeenCalledTimes(3);
    });
  });
});

