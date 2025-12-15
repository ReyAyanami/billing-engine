import { AccountAggregate } from '../../src/modules/account/aggregates/account.aggregate';
import { AccountType } from '../../src/modules/account/account.types';

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
});
