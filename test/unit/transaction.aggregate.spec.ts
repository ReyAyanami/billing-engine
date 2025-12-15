import { TransactionAggregate } from '../../src/modules/transaction/aggregates/transaction.aggregate';
import { TransactionStatus } from '../../src/modules/transaction/aggregates/transaction.aggregate';
import { TransactionType } from '../../src/modules/transaction/aggregates/transaction.aggregate';

describe('TransactionAggregate', () => {
  let aggregate: TransactionAggregate;
  const correlationId = 'test-correlation-123';

  beforeEach(() => {
    aggregate = new TransactionAggregate();
  });

  describe('Transaction Failure Flows', () => {
    describe('fail()', () => {
      it('should fail a pending topup transaction', () => {
        // Arrange: Create a pending topup
        aggregate.requestTopup({
          transactionId: 'tx-001',
          accountId: 'acc-123',
          amount: '100.00',
          currency: 'USD',
          sourceAccountId: 'bank-001',
          idempotencyKey: 'idem-001',
          correlationId,
        });

        expect(aggregate.getStatus()).toBe(TransactionStatus.PENDING);

        // Act: Fail the transaction
        aggregate.fail({
          reason: 'Insufficient funds in source account',
          errorCode: 'INSUFFICIENT_FUNDS',
          correlationId,
        });

        // Assert
        expect(aggregate.getStatus()).toBe(TransactionStatus.FAILED);
        expect(aggregate.getFailureReason()).toBe(
          'Insufficient funds in source account',
        );
        expect(aggregate.getFailedAt()).toBeInstanceOf(Date);
      });

      it('should fail a pending payment transaction', () => {
        // Arrange: Create a pending payment
        aggregate.requestPayment({
          transactionId: 'tx-002',
          customerAccountId: 'cust-123',
          merchantAccountId: 'merch-456',
          amount: '50.00',
          currency: 'USD',
          idempotencyKey: 'idem-002',
          correlationId,
        });

        // Act
        aggregate.fail({
          reason: 'Customer account suspended',
          errorCode: 'ACCOUNT_SUSPENDED',
          correlationId,
        });

        // Assert
        expect(aggregate.getStatus()).toBe(TransactionStatus.FAILED);
        expect(aggregate.getFailureReason()).toBe('Customer account suspended');
      });

      it('should reject failing a non-existent transaction', () => {
        // Aggregate has no transaction yet
        expect(() => {
          aggregate.fail({
            reason: 'Some reason',
            errorCode: 'SOME_ERROR',
            correlationId,
          });
        }).toThrow('Transaction does not exist');
      });

      it('should reject failing a completed transaction', () => {
        // Arrange: Create and complete a topup
        aggregate.requestTopup({
          transactionId: 'tx-003',
          accountId: 'acc-123',
          amount: '100.00',
          currency: 'USD',
          sourceAccountId: 'bank-001',
          idempotencyKey: 'idem-003',
          correlationId,
        });

        aggregate.completeTopup({
          newBalance: '200.00',
          correlationId,
        });

        // Act & Assert
        expect(() => {
          aggregate.fail({
            reason: 'Too late',
            errorCode: 'ALREADY_COMPLETED',
            correlationId,
          });
        }).toThrow('Cannot fail transaction with status: completed');
      });

      it('should reject failing an already failed transaction', () => {
        // Arrange: Create and fail a transaction
        aggregate.requestTopup({
          transactionId: 'tx-004',
          accountId: 'acc-123',
          amount: '100.00',
          currency: 'USD',
          sourceAccountId: 'bank-001',
          idempotencyKey: 'idem-004',
          correlationId,
        });

        aggregate.fail({
          reason: 'First failure',
          errorCode: 'FIRST_ERROR',
          correlationId,
        });

        // Act & Assert
        expect(() => {
          aggregate.fail({
            reason: 'Second failure',
            errorCode: 'SECOND_ERROR',
            correlationId,
          });
        }).toThrow('Cannot fail transaction with status: failed');
      });

      it('should reject failing a compensated transaction', () => {
        // Arrange: Create and compensate a transaction
        aggregate.requestTransfer({
          transactionId: 'tx-005',
          sourceAccountId: 'acc-123',
          destinationAccountId: 'acc-456',
          amount: '100.00',
          currency: 'USD',
          idempotencyKey: 'idem-005',
          correlationId,
        });

        aggregate.compensate({
          reason: 'Saga rollback',
          compensationActions: [
            {
              accountId: 'acc-123',
              action: 'CREDIT',
              amount: '100.00',
              reason: 'Reversal',
            },
          ],
          correlationId,
        });

        // Act & Assert
        expect(() => {
          aggregate.fail({
            reason: 'Cannot fail compensated',
            errorCode: 'WRONG_STATUS',
            correlationId,
          });
        }).toThrow('Cannot fail transaction with status: compensated');
      });
    });
  });

  describe('Transaction Compensation Flows', () => {
    describe('compensate()', () => {
      it('should compensate a pending transaction', () => {
        // Arrange: Create a pending transfer
        aggregate.requestTransfer({
          transactionId: 'tx-comp-001',
          sourceAccountId: 'acc-123',
          destinationAccountId: 'acc-456',
          amount: '100.00',
          currency: 'USD',
          idempotencyKey: 'idem-comp-001',
          correlationId,
        });

        expect(aggregate.getStatus()).toBe(TransactionStatus.PENDING);

        // Act: Compensate the transaction
        const compensationActions = [
          {
            accountId: 'acc-123',
            action: 'CREDIT' as const,
            amount: '100.00',
            reason: 'Restore debited amount',
          },
          {
            accountId: 'acc-456',
            action: 'DEBIT' as const,
            amount: '100.00',
            reason: 'Remove credited amount',
          },
        ];

        aggregate.compensate({
          reason: 'Saga failed at later step',
          compensationActions,
          correlationId,
        });

        // Assert
        expect(aggregate.getStatus()).toBe(TransactionStatus.COMPENSATED);
        expect(aggregate.getCompensationReason()).toBe(
          'Saga failed at later step',
        );

        const actions = aggregate.getCompensationActions();
        expect(actions).toHaveLength(2);
        expect(actions?.[0].accountId).toBe('acc-123');
        expect(actions?.[0].action).toBe('CREDIT');
        expect(actions?.[0].amount).toBe('100.00');
        expect(actions?.[0].timestamp).toBeDefined();

        expect(aggregate.getCompensatedAt()).toBeInstanceOf(Date);
      });

      it('should compensate a failed transaction', () => {
        // Arrange: Create and fail a transaction
        aggregate.requestPayment({
          transactionId: 'tx-comp-002',
          customerAccountId: 'cust-123',
          merchantAccountId: 'merch-456',
          amount: '50.00',
          currency: 'USD',
          idempotencyKey: 'idem-comp-002',
          correlationId,
        });

        aggregate.fail({
          reason: 'Validation failed',
          errorCode: 'VALIDATION_ERROR',
          correlationId,
        });

        // Act: Compensate
        aggregate.compensate({
          reason: 'Clean up after failure',
          compensationActions: [
            {
              accountId: 'cust-123',
              action: 'CREDIT',
              amount: '50.00',
              reason: 'Refund hold',
            },
          ],
          correlationId,
        });

        // Assert
        expect(aggregate.getStatus()).toBe(TransactionStatus.COMPENSATED);
      });

      it('should reject compensating a non-existent transaction', () => {
        // Aggregate has no transaction yet
        expect(() => {
          aggregate.compensate({
            reason: 'Cannot compensate nothing',
            compensationActions: [],
            correlationId,
          });
        }).toThrow('Transaction does not exist');
      });

      it('should reject compensating a completed transaction', () => {
        // Arrange: Create and complete a transaction
        aggregate.requestWithdrawal({
          transactionId: 'tx-comp-003',
          accountId: 'acc-123',
          amount: '75.00',
          currency: 'USD',
          destinationAccountId: 'bank-001',
          idempotencyKey: 'idem-comp-003',
          correlationId,
        });

        aggregate.completeWithdrawal({
          newBalance: '25.00',
          correlationId,
        });

        // Act & Assert
        expect(() => {
          aggregate.compensate({
            reason: 'Too late to compensate',
            compensationActions: [
              {
                accountId: 'acc-123',
                action: 'CREDIT',
                amount: '75.00',
                reason: 'Reversal',
              },
            ],
            correlationId,
          });
        }).toThrow('Cannot compensate a completed transaction');
      });

      it('should reject compensating an already compensated transaction', () => {
        // Arrange: Create and compensate a transaction
        aggregate.requestTopup({
          transactionId: 'tx-comp-004',
          accountId: 'acc-123',
          amount: '100.00',
          currency: 'USD',
          sourceAccountId: 'bank-001',
          idempotencyKey: 'idem-comp-004',
          correlationId,
        });

        aggregate.compensate({
          reason: 'First compensation',
          compensationActions: [
            {
              accountId: 'acc-123',
              action: 'DEBIT',
              amount: '100.00',
              reason: 'Undo topup',
            },
          ],
          correlationId,
        });

        // Act & Assert
        expect(() => {
          aggregate.compensate({
            reason: 'Second compensation',
            compensationActions: [],
            correlationId,
          });
        }).toThrow('Transaction is already compensated');
      });

      it('should store multiple compensation actions with timestamps', () => {
        // Arrange
        aggregate.requestTransfer({
          transactionId: 'tx-comp-005',
          sourceAccountId: 'acc-123',
          destinationAccountId: 'acc-456',
          amount: '100.00',
          currency: 'USD',
          idempotencyKey: 'idem-comp-005',
          correlationId,
        });

        // Act: Compensate with multiple actions
        const actions = [
          {
            accountId: 'acc-123',
            action: 'CREDIT' as const,
            amount: '100.00',
            reason: 'Restore source',
          },
          {
            accountId: 'acc-456',
            action: 'DEBIT' as const,
            amount: '100.00',
            reason: 'Restore destination',
          },
          {
            accountId: 'fee-account',
            action: 'DEBIT' as const,
            amount: '2.00',
            reason: 'Reverse fee',
          },
        ];

        aggregate.compensate({
          reason: 'Multi-step rollback',
          compensationActions: actions,
          correlationId,
        });

        // Assert
        const storedActions = aggregate.getCompensationActions();
        expect(storedActions).toHaveLength(3);
        storedActions?.forEach((action) => {
          expect(action.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
        });
      });
    });
  });

  describe('Transaction Type Labels', () => {
    it('should return correct label for topup', () => {
      aggregate.requestTopup({
        transactionId: 'tx-label-001',
        accountId: 'acc-123',
        amount: '100.00',
        currency: 'USD',
        sourceAccountId: 'bank-001',
        idempotencyKey: 'idem-label-001',
        correlationId,
      });

      expect(aggregate.getTransactionTypeLabel()).toBe('Top-up');
    });

    it('should return correct label for withdrawal', () => {
      aggregate.requestWithdrawal({
        transactionId: 'tx-label-002',
        accountId: 'acc-123',
        amount: '50.00',
        currency: 'USD',
        destinationAccountId: 'bank-001',
        idempotencyKey: 'idem-label-002',
        correlationId,
      });

      expect(aggregate.getTransactionTypeLabel()).toBe('Withdrawal');
    });

    it('should return correct label for transfer', () => {
      aggregate.requestTransfer({
        transactionId: 'tx-label-003',
        sourceAccountId: 'acc-123',
        destinationAccountId: 'acc-456',
        amount: '75.00',
        currency: 'USD',
        idempotencyKey: 'idem-label-003',
        correlationId,
      });

      expect(aggregate.getTransactionTypeLabel()).toBe('Transfer');
    });

    it('should return correct label for payment', () => {
      aggregate.requestPayment({
        transactionId: 'tx-label-004',
        customerAccountId: 'cust-123',
        merchantAccountId: 'merch-456',
        amount: '25.00',
        currency: 'USD',
        idempotencyKey: 'idem-label-004',
        correlationId,
      });

      expect(aggregate.getTransactionTypeLabel()).toBe('Payment');
    });

    it('should return correct label for refund', () => {
      aggregate.requestRefund({
        refundId: 'tx-label-005',
        originalPaymentId: 'payment-123',
        merchantAccountId: 'merch-456',
        customerAccountId: 'cust-123',
        refundAmount: '25.00',
        currency: 'USD',
        idempotencyKey: 'idem-label-005',
        correlationId,
      });

      expect(aggregate.getTransactionTypeLabel()).toBe('Refund');
    });
  });

  describe('State Snapshots', () => {
    it('should create snapshot of pending topup', () => {
      aggregate.requestTopup({
        transactionId: 'tx-snap-001',
        accountId: 'acc-123',
        amount: '100.00',
        currency: 'USD',
        sourceAccountId: 'bank-001',
        idempotencyKey: 'idem-snap-001',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot).toMatchObject({
        aggregateId: 'tx-snap-001',
        version: 1,
        transactionType: TransactionType.TOPUP,
        status: TransactionStatus.PENDING,
        amount: '100.00',
        currency: 'USD',
        accountId: 'acc-123',
        sourceAccountId: 'bank-001',
        idempotencyKey: 'idem-snap-001',
        newBalance: null,
        compensationReason: null,
        compensationActions: null,
        compensatedAt: null,
        failureReason: null,
        failureCode: null,
        completedAt: null,
        failedAt: null,
      });

      expect(snapshot.requestedAt).toBeDefined();
      expect(typeof snapshot.requestedAt).toBe('string');
    });

    it('should create snapshot of completed transfer', () => {
      aggregate.requestTransfer({
        transactionId: 'tx-snap-002',
        sourceAccountId: 'acc-123',
        destinationAccountId: 'acc-456',
        amount: '50.00',
        currency: 'USD',
        idempotencyKey: 'idem-snap-002',
        correlationId,
      });

      aggregate.completeTransfer({
        sourceNewBalance: '50.00',
        destinationNewBalance: '150.00',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot).toMatchObject({
        aggregateId: 'tx-snap-002',
        version: 2,
        transactionType: TransactionType.TRANSFER,
        status: TransactionStatus.COMPLETED,
        amount: '50.00',
        currency: 'USD',
        sourceAccountId: 'acc-123',
        destinationAccountId: 'acc-456',
        sourceNewBalance: '50.00',
        destinationNewBalance: '150.00',
        accountId: null,
      });

      expect(snapshot.completedAt).toBeDefined();
    });

    it('should create snapshot of failed transaction', () => {
      aggregate.requestPayment({
        transactionId: 'tx-snap-003',
        customerAccountId: 'cust-123',
        merchantAccountId: 'merch-456',
        amount: '25.00',
        currency: 'USD',
        idempotencyKey: 'idem-snap-003',
        correlationId,
      });

      aggregate.fail({
        reason: 'Network timeout',
        errorCode: 'TIMEOUT',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot).toMatchObject({
        status: TransactionStatus.FAILED,
        failureReason: 'Network timeout',
        failureCode: 'TIMEOUT',
      });

      expect(snapshot.failedAt).toBeDefined();
    });

    it('should create snapshot of compensated transaction', () => {
      aggregate.requestWithdrawal({
        transactionId: 'tx-snap-004',
        accountId: 'acc-123',
        amount: '100.00',
        currency: 'USD',
        destinationAccountId: 'bank-001',
        idempotencyKey: 'idem-snap-004',
        correlationId,
      });

      aggregate.compensate({
        reason: 'Saga rollback',
        compensationActions: [
          {
            accountId: 'acc-123',
            action: 'CREDIT',
            amount: '100.00',
            reason: 'Restore balance',
          },
        ],
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot).toMatchObject({
        status: TransactionStatus.COMPENSATED,
        compensationReason: 'Saga rollback',
      });

      expect(snapshot.compensationActions).toHaveLength(1);
      expect(snapshot.compensatedAt).toBeDefined();
    });
  });

  describe('Getters', () => {
    beforeEach(() => {
      aggregate.requestTopup({
        transactionId: 'tx-get-001',
        accountId: 'acc-123',
        amount: '100.00',
        currency: 'USD',
        sourceAccountId: 'bank-001',
        idempotencyKey: 'idem-get-001',
        correlationId,
      });
    });

    it('should return transaction type', () => {
      expect(aggregate.getTransactionType()).toBe(TransactionType.TOPUP);
    });

    it('should return status', () => {
      expect(aggregate.getStatus()).toBe(TransactionStatus.PENDING);
    });

    it('should return amount', () => {
      expect(aggregate.getAmount()).toBe('100.00');
    });

    it('should return currency', () => {
      expect(aggregate.getCurrency()).toBe('USD');
    });

    it('should return idempotency key', () => {
      expect(aggregate.getIdempotencyKey()).toBe('idem-get-001');
    });

    it('should return account ID', () => {
      expect(aggregate.getAccountId()).toBe('acc-123');
    });

    it('should return source account ID', () => {
      expect(aggregate.getSourceAccountId()).toBe('bank-001');
    });

    it('should return requested at', () => {
      expect(aggregate.getRequestedAt()).toBeInstanceOf(Date);
    });

    it('should return undefined for destination account on topup', () => {
      expect(aggregate.getDestinationAccountId()).toBeUndefined();
    });

    it('should return undefined for new balance before completion', () => {
      expect(aggregate.getNewBalance()).toBeUndefined();
    });

    it('should return undefined for completed at before completion', () => {
      expect(aggregate.getCompletedAt()).toBeUndefined();
    });

    it('should return undefined for failed at before failure', () => {
      expect(aggregate.getFailedAt()).toBeUndefined();
    });

    it('should return undefined for failure reason before failure', () => {
      expect(aggregate.getFailureReason()).toBeUndefined();
    });

    it('should return undefined for compensation details before compensation', () => {
      expect(aggregate.getCompensationReason()).toBeUndefined();
      expect(aggregate.getCompensationActions()).toBeUndefined();
      expect(aggregate.getCompensatedAt()).toBeUndefined();
    });

    it('should return new balance after completion', () => {
      aggregate.completeTopup({
        newBalance: '200.00',
        correlationId,
      });

      expect(aggregate.getNewBalance()).toBe('200.00');
      expect(aggregate.getCompletedAt()).toBeInstanceOf(Date);
    });

    it('should return failure details after failure', () => {
      aggregate.fail({
        reason: 'Test failure',
        errorCode: 'TEST_ERROR',
        correlationId,
      });

      expect(aggregate.getFailureReason()).toBe('Test failure');
      expect(aggregate.getFailedAt()).toBeInstanceOf(Date);
    });
  });

  describe('Edge Cases', () => {
    it('should handle transaction with metadata', () => {
      const metadata = { orderId: '12345', customerId: 'cust-999' };

      aggregate.requestPayment({
        transactionId: 'tx-edge-001',
        customerAccountId: 'cust-123',
        merchantAccountId: 'merch-456',
        amount: '99.99',
        currency: 'USD',
        idempotencyKey: 'idem-edge-001',
        correlationId,
        metadata,
      });

      // Metadata should be stored in events
      const events = aggregate.getUncommittedEvents();
      expect(events[0].metadata).toEqual(metadata);
    });

    it('should maintain aggregate version through state transitions', () => {
      aggregate.requestTopup({
        transactionId: 'tx-edge-002',
        accountId: 'acc-123',
        amount: '100.00',
        currency: 'USD',
        sourceAccountId: 'bank-001',
        idempotencyKey: 'idem-edge-002',
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(1);

      aggregate.completeTopup({
        newBalance: '200.00',
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(2);
    });

    it('should maintain version through failure transition', () => {
      aggregate.requestWithdrawal({
        transactionId: 'tx-edge-003',
        accountId: 'acc-123',
        amount: '50.00',
        currency: 'USD',
        destinationAccountId: 'bank-001',
        idempotencyKey: 'idem-edge-003',
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(1);

      aggregate.fail({
        reason: 'Test',
        errorCode: 'TEST',
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(2);
    });

    it('should maintain version through compensation transition', () => {
      aggregate.requestTransfer({
        transactionId: 'tx-edge-004',
        sourceAccountId: 'acc-123',
        destinationAccountId: 'acc-456',
        amount: '100.00',
        currency: 'USD',
        idempotencyKey: 'idem-edge-004',
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(1);

      aggregate.compensate({
        reason: 'Rollback',
        compensationActions: [],
        correlationId,
      });

      expect(aggregate.getVersion()).toBe(2);
    });
  });
});

