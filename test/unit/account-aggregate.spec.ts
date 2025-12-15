import { AccountAggregate } from '../../src/modules/account/aggregates/account.aggregate';
import {
  AccountType,
  AccountStatus,
} from '../../src/modules/account/account.types';

describe('AccountAggregate - Balance Change Validation', () => {
  let aggregate: AccountAggregate;
  const accountId = 'test-account-123';
  const correlationId = 'test-correlation-123';

  beforeEach(() => {
    aggregate = new AccountAggregate();

    // Create account first
    aggregate.create({
      accountId,
      ownerId: 'owner-123',
      ownerType: 'user',
      accountType: AccountType.USER,
      currency: 'USD',
      correlationId,
      metadata: {},
    });
  });

  describe('changeAmount validation', () => {
    it('should reject negative changeAmount', () => {
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '-50.00',
          changeType: 'CREDIT',
          reason: 'Test negative amount',
          correlationId,
        });
      }).toThrow('Change amount must be positive');
    });

    it('should reject zero changeAmount', () => {
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '0',
          changeType: 'CREDIT',
          reason: 'Test zero amount',
          correlationId,
        });
      }).toThrow('Change amount must be positive');
    });

    it('should reject zero changeAmount as decimal', () => {
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '0.00',
          changeType: 'DEBIT',
          reason: 'Test zero amount',
          correlationId,
        });
      }).toThrow('Change amount must be positive');
    });

    it('should accept positive changeAmount for CREDIT', () => {
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '100.00',
          changeType: 'CREDIT',
          reason: 'Test positive amount',
          correlationId,
        });
      }).not.toThrow();
    });

    it('should accept positive changeAmount for DEBIT with sufficient balance', () => {
      // First add some balance
      aggregate.changeBalance({
        changeAmount: '100.00',
        changeType: 'CREDIT',
        reason: 'Initial balance',
        correlationId,
      });

      // Then debit
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '50.00',
          changeType: 'DEBIT',
          reason: 'Test debit',
          correlationId,
        });
      }).not.toThrow();
    });
  });

  describe('signedAmount calculation and balance', () => {
    it('should calculate correct signedAmount for CREDIT', () => {
      aggregate.changeBalance({
        changeAmount: '100.00',
        changeType: 'CREDIT',
        reason: 'Credit test',
        correlationId,
      });

      const events = aggregate.getUncommittedEvents();
      const balanceEvent = events.find(
        (e) => e.getEventType() === 'BalanceChanged',
      );

      expect(balanceEvent).toBeDefined();
      if (balanceEvent && 'signedAmount' in balanceEvent) {
        expect(balanceEvent.signedAmount).toBe('100');
      }
    });

    it('should calculate correct signedAmount for DEBIT', () => {
      // First add balance
      aggregate.changeBalance({
        changeAmount: '200.00',
        changeType: 'CREDIT',
        reason: 'Initial',
        correlationId,
      });

      aggregate.commit(); // Clear events

      // Then debit
      aggregate.changeBalance({
        changeAmount: '50.00',
        changeType: 'DEBIT',
        reason: 'Debit test',
        correlationId,
      });

      const events = aggregate.getUncommittedEvents();
      const balanceEvent = events.find(
        (e) => e.getEventType() === 'BalanceChanged',
      );

      expect(balanceEvent).toBeDefined();
      if (balanceEvent && 'signedAmount' in balanceEvent) {
        expect(balanceEvent.signedAmount).toBe('-50');
      }
    });

    it('should calculate balance correctly using signedAmount', () => {
      // Add 100
      aggregate.changeBalance({
        changeAmount: '100.00',
        changeType: 'CREDIT',
        reason: 'Add 100',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('100');

      // Add 50 more
      aggregate.changeBalance({
        changeAmount: '50.00',
        changeType: 'CREDIT',
        reason: 'Add 50',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('150');

      // Debit 30
      aggregate.changeBalance({
        changeAmount: '30.00',
        changeType: 'DEBIT',
        reason: 'Debit 30',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('120');
    });
  });

  describe('Account Status Changes', () => {
    it('should change status from ACTIVE to SUSPENDED', () => {
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Suspicious activity detected',
        correlationId,
      });

      expect(aggregate.getStatus()).toBe(AccountStatus.SUSPENDED);
    });

    it('should change status from ACTIVE to CLOSED', () => {
      aggregate.changeStatus({
        newStatus: AccountStatus.CLOSED,
        reason: 'User requested closure',
        correlationId,
      });

      expect(aggregate.getStatus()).toBe(AccountStatus.CLOSED);
    });

    it('should change status from SUSPENDED to ACTIVE', () => {
      // First suspend
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Temporary suspension',
        correlationId,
      });

      // Then reactivate
      aggregate.changeStatus({
        newStatus: AccountStatus.ACTIVE,
        reason: 'Issue resolved',
        correlationId,
      });

      expect(aggregate.getStatus()).toBe(AccountStatus.ACTIVE);
    });

    it('should change status from SUSPENDED to CLOSED', () => {
      // First suspend
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Temporary suspension',
        correlationId,
      });

      // Then close
      aggregate.changeStatus({
        newStatus: AccountStatus.CLOSED,
        reason: 'Permanent closure',
        correlationId,
      });

      expect(aggregate.getStatus()).toBe(AccountStatus.CLOSED);
    });

    it('should reject status change to same status', () => {
      expect(() => {
        aggregate.changeStatus({
          newStatus: AccountStatus.ACTIVE,
          reason: 'Already active',
          correlationId,
        });
      }).toThrow('Account already has status: active');
    });

    it('should reject invalid status transition from CLOSED', () => {
      // Close the account
      aggregate.changeStatus({
        newStatus: AccountStatus.CLOSED,
        reason: 'Closure',
        correlationId,
      });

      // Try to reopen (should fail)
      expect(() => {
        aggregate.changeStatus({
          newStatus: AccountStatus.ACTIVE,
          reason: 'Cannot reopen',
          correlationId,
        });
      }).toThrow('Invalid status transition from closed to active');
    });

    it('should reject status change on non-existent account', () => {
      const newAggregate = new AccountAggregate();

      expect(() => {
        newAggregate.changeStatus({
          newStatus: AccountStatus.SUSPENDED,
          reason: 'Cannot change status',
          correlationId,
        });
      }).toThrow('Account does not exist');
    });

    it('should prevent balance changes when account is suspended', () => {
      // Suspend account
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Suspension',
        correlationId,
      });

      // Try to change balance
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '100.00',
          changeType: 'CREDIT',
          reason: 'Cannot do this',
          correlationId,
        });
      }).toThrow('Cannot change balance on account with status: suspended');
    });

    it('should prevent balance changes when account is closed', () => {
      // Close account
      aggregate.changeStatus({
        newStatus: AccountStatus.CLOSED,
        reason: 'Closure',
        correlationId,
      });

      // Try to change balance
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '50.00',
          changeType: 'CREDIT',
          reason: 'Cannot do this',
          correlationId,
        });
      }).toThrow('Cannot change balance on account with status: closed');
    });
  });

  describe('Account Limits Changes', () => {
    it('should set max balance limit', () => {
      aggregate.changeLimits({
        newMaxBalance: '10000.00',
        reason: 'Set max balance',
        correlationId,
      });

      expect(aggregate.getMaxBalance()?.toString()).toBe('10000');
    });

    it('should set min balance limit', () => {
      aggregate.changeLimits({
        newMinBalance: '-500.00',
        reason: 'Allow overdraft',
        correlationId,
      });

      expect(aggregate.getMinBalance()?.toString()).toBe('-500');
    });

    it('should set both max and min balance limits', () => {
      aggregate.changeLimits({
        newMaxBalance: '5000.00',
        newMinBalance: '0.00',
        reason: 'Set both limits',
        correlationId,
      });

      expect(aggregate.getMaxBalance()?.toString()).toBe('5000');
      expect(aggregate.getMinBalance()?.toString()).toBe('0');
    });

    it('should reject if no limits provided', () => {
      expect(() => {
        aggregate.changeLimits({
          reason: 'No limits',
          correlationId,
        });
      }).toThrow('Must provide at least one new limit');
    });

    it('should reject if max balance is less than or equal to min balance', () => {
      expect(() => {
        aggregate.changeLimits({
          newMaxBalance: '100.00',
          newMinBalance: '200.00',
          reason: 'Invalid limits',
          correlationId,
        });
      }).toThrow('Max balance must be greater than min balance');
    });

    it('should reject if max balance equals min balance', () => {
      expect(() => {
        aggregate.changeLimits({
          newMaxBalance: '100.00',
          newMinBalance: '100.00',
          reason: 'Equal limits',
          correlationId,
        });
      }).toThrow('Max balance must be greater than min balance');
    });

    it('should reject if current balance exceeds new max balance', () => {
      // Add some balance first
      aggregate.changeBalance({
        changeAmount: '500.00',
        changeType: 'CREDIT',
        reason: 'Add balance',
        correlationId,
      });

      // Try to set max balance below current balance
      expect(() => {
        aggregate.changeLimits({
          newMaxBalance: '100.00',
          reason: 'Max too low',
          correlationId,
        });
      }).toThrow('Current balance 500 exceeds new max 100');
    });

    it('should reject if current balance is below new min balance', () => {
      // Current balance is 0
      expect(() => {
        aggregate.changeLimits({
          newMinBalance: '100.00',
          reason: 'Min too high',
          correlationId,
        });
      }).toThrow('Current balance 0 is below new min 100');
    });

    it('should enforce max balance on subsequent transactions', () => {
      // Set max balance
      aggregate.changeLimits({
        newMaxBalance: '1000.00',
        reason: 'Set max',
        correlationId,
      });

      // Add balance up to the limit
      aggregate.changeBalance({
        changeAmount: '900.00',
        changeType: 'CREDIT',
        reason: 'Near limit',
        correlationId,
      });

      // Try to exceed limit
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '200.00',
          changeType: 'CREDIT',
          reason: 'Exceed limit',
          correlationId,
        });
      }).toThrow('New balance 1100 would exceed max balance 1000');
    });

    it('should enforce min balance on subsequent transactions', () => {
      // Set min balance and add initial funds
      aggregate.changeLimits({
        newMinBalance: '-100.00',
        reason: 'Allow overdraft',
        correlationId,
      });

      aggregate.changeBalance({
        changeAmount: '50.00',
        changeType: 'CREDIT',
        reason: 'Add funds',
        correlationId,
      });

      // Try to go below min balance
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '200.00',
          changeType: 'DEBIT',
          reason: 'Exceed overdraft',
          correlationId,
        });
      }).toThrow('Insufficient balance');
    });

    it('should allow updating limits on non-existent account to fail', () => {
      const newAggregate = new AccountAggregate();

      expect(() => {
        newAggregate.changeLimits({
          newMaxBalance: '1000.00',
          reason: 'Cannot set',
          correlationId,
        });
      }).toThrow('Account does not exist');
    });
  });

  describe('Account Snapshots', () => {
    it('should create snapshot of account with balance', () => {
      aggregate.changeBalance({
        changeAmount: '250.00',
        changeType: 'CREDIT',
        reason: 'Test',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot).toMatchObject({
        aggregateId: accountId,
        ownerId: 'owner-123',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        balance: '250',
      });

      expect(snapshot.createdAt).toBeDefined();
      expect(snapshot.updatedAt).toBeDefined();
      expect(snapshot.maxBalance).toBeNull();
      expect(snapshot.minBalance).toBeNull();
    });

    it('should create snapshot of account with limits', () => {
      aggregate.changeLimits({
        newMaxBalance: '5000.00',
        newMinBalance: '0.00',
        reason: 'Set limits',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot.maxBalance).toBe('5000');
      expect(snapshot.minBalance).toBe('0');
    });

    it('should create snapshot of suspended account', () => {
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Suspension',
        correlationId,
      });

      const snapshot = aggregate.toSnapshot();

      expect(snapshot.status).toBe(AccountStatus.SUSPENDED);
    });

    it('should include version in snapshot', () => {
      // Initial version is 1
      let snapshot = aggregate.toSnapshot();
      expect(snapshot.version).toBe(1);

      // After a status change, version should be 2
      aggregate.changeStatus({
        newStatus: AccountStatus.SUSPENDED,
        reason: 'Test',
        correlationId,
      });

      snapshot = aggregate.toSnapshot();
      expect(snapshot.version).toBe(2);
    });
  });

  describe('Edge Cases and Additional Validations', () => {
    it('should handle decimal precision correctly', () => {
      aggregate.changeBalance({
        changeAmount: '0.01',
        changeType: 'CREDIT',
        reason: 'Penny',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('0.01');

      aggregate.changeBalance({
        changeAmount: '0.01',
        changeType: 'DEBIT',
        reason: 'Remove penny',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('0');
    });

    it('should handle large amounts', () => {
      aggregate.changeBalance({
        changeAmount: '999999999.99',
        changeType: 'CREDIT',
        reason: 'Large amount',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('999999999.99');
    });

    it('should prevent negative balance by default', () => {
      // Account starts with 0 balance and no min balance set
      expect(() => {
        aggregate.changeBalance({
          changeAmount: '50.00',
          changeType: 'DEBIT',
          reason: 'Try to go negative',
          correlationId,
        });
      }).toThrow('Insufficient balance');
    });

    it('should allow negative balance when min balance is set below zero', () => {
      aggregate.changeLimits({
        newMinBalance: '-100.00',
        reason: 'Allow overdraft',
        correlationId,
      });

      // Should work now
      aggregate.changeBalance({
        changeAmount: '50.00',
        changeType: 'DEBIT',
        reason: 'Use overdraft',
        correlationId,
      });

      expect(aggregate.getBalance().toString()).toBe('-50');
    });
  });
});
