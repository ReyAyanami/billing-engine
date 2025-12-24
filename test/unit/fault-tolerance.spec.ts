import { Test } from '@nestjs/testing';
import { AccountProjectionRebuildService } from '../../src/modules/account/services/account-projection-rebuild.service';
import { AccountReconciliationService } from '../../src/modules/account/services/account-reconciliation.service';
import { AccountAggregate } from '../../src/modules/account/aggregates/account.aggregate';
import { AccountProjection } from '../../src/modules/account/projections/account-projection.entity';

import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AccountStatus,
  AccountType,
} from '../../src/modules/account/account.types';
import { AccountCreatedEvent } from '../../src/modules/account/events/account-created.event';
import { BalanceChangedEvent } from '../../src/modules/account/events/balance-changed.event';
import { InvariantViolationException } from '../../src/common/exceptions/billing.exception';

describe('Fault Tolerance', () => {
  describe('Account Invariant Validation', () => {
    it('should detect negative balance violation', () => {
      const aggregate = new AccountAggregate();
      const createEvent = new AccountCreatedEvent({
        ownerId: 'owner-1',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        balance: '100.00',
        aggregateId: 'acc-1',
        aggregateVersion: 1,
        correlationId: 'corr-1',
        homeRegionId: 'region-1',
      });

      aggregate['onAccountCreated'](createEvent);

      const debitEvent = new BalanceChangedEvent({
        previousBalance: '100.00',
        newBalance: '-50.00',
        changeAmount: '150.00',
        signedAmount: '-150.00',
        changeType: 'DEBIT',
        reason: 'withdrawal',
        transactionId: 'tx-1',
        aggregateId: 'acc-1',
        aggregateVersion: 2,
        correlationId: 'corr-1',
      });

      aggregate['onBalanceChanged'](debitEvent);

      expect(() => aggregate.validateInvariants()).toThrow(
        InvariantViolationException,
      );
      expect(() => aggregate.validateInvariants()).toThrow(/negative balance/);
    });

    it('should detect max balance violation', () => {
      const aggregate = new AccountAggregate();
      const createEvent = new AccountCreatedEvent({
        ownerId: 'owner-1',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        balance: '100.00',
        maxBalance: '1000.00',
        aggregateId: 'acc-1',
        aggregateVersion: 1,
        correlationId: 'corr-1',
        homeRegionId: 'region-1',
      });

      aggregate['onAccountCreated'](createEvent);

      const creditEvent = new BalanceChangedEvent({
        previousBalance: '100.00',
        newBalance: '2000.00',
        changeAmount: '1900.00',
        signedAmount: '1900.00',
        changeType: 'CREDIT',
        reason: 'topup',
        transactionId: 'tx-1',
        aggregateId: 'acc-1',
        aggregateVersion: 2,
        correlationId: 'corr-1',
      });

      aggregate['onBalanceChanged'](creditEvent);

      expect(() => aggregate.validateInvariants()).toThrow(
        InvariantViolationException,
      );
      expect(() => aggregate.validateInvariants()).toThrow(/exceeds max/);
    });

    it('should pass validation for valid state', () => {
      const aggregate = new AccountAggregate();
      const createEvent = new AccountCreatedEvent({
        ownerId: 'owner-1',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        balance: '100.00',
        maxBalance: '1000.00',
        minBalance: '0.00',
        aggregateId: 'acc-1',
        aggregateVersion: 1,
        correlationId: 'corr-1',
        homeRegionId: 'region-1',
      });

      aggregate['onAccountCreated'](createEvent);

      const creditEvent = new BalanceChangedEvent({
        previousBalance: '100.00',
        newBalance: '500.00',
        changeAmount: '400.00',
        signedAmount: '400.00',
        changeType: 'CREDIT',
        reason: 'topup',
        transactionId: 'tx-1',
        aggregateId: 'acc-1',
        aggregateVersion: 2,
        correlationId: 'corr-1',
      });

      aggregate['onBalanceChanged'](creditEvent);

      expect(() => aggregate.validateInvariants()).not.toThrow();
    });
  });

  describe('Account Reconciliation', () => {
    let service: AccountReconciliationService;
    let mockEventStore: any;
    let mockRepository: any;

    beforeEach(async () => {
      mockEventStore = {
        getEvents: jest.fn(),
      };

      mockRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
      };

      const module = await Test.createTestingModule({
        providers: [
          AccountReconciliationService,
          {
            provide: 'EVENT_STORE',
            useValue: mockEventStore,
          },
          {
            provide: getRepositoryToken(AccountProjection),
            useValue: mockRepository,
          },
        ],
      }).compile();

      service = module.get<AccountReconciliationService>(
        AccountReconciliationService,
      );
    });

    it('should detect balance mismatch', async () => {
      const accountId = 'acc-1';

      const projection = {
        id: accountId,
        balance: '100.00',
        aggregateVersion: 2,
        status: AccountStatus.ACTIVE,
      };

      const events = [
        new AccountCreatedEvent({
          ownerId: 'owner-1',
          ownerType: 'user',
          accountType: AccountType.USER,
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          balance: '0.00',
          aggregateId: accountId,
          aggregateVersion: 1,
          correlationId: 'corr-1',
          homeRegionId: 'region-1',
        }),
        new BalanceChangedEvent({
          previousBalance: '0.00',
          newBalance: '200.00',
          changeAmount: '200.00',
          signedAmount: '200.00',
          changeType: 'CREDIT',
          reason: 'topup',
          transactionId: 'tx-1',
          aggregateId: accountId,
          aggregateVersion: 2,
          correlationId: 'corr-1',
        }),
      ];

      mockRepository.findOne.mockResolvedValue(projection);
      mockEventStore.getEvents.mockResolvedValue(events);

      const result = await service.reconcileAccount(accountId as any);

      expect(result.match).toBe(false);
      expect(result.projectionBalance).toBe('100.00000000');
      expect(result.eventSourceBalance).toBe('200.00000000');
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should confirm matching state', async () => {
      const accountId = 'acc-1';

      const projection = {
        id: accountId,
        balance: '200.00',
        aggregateVersion: 2,
        status: AccountStatus.ACTIVE,
      };

      const events = [
        new AccountCreatedEvent({
          ownerId: 'owner-1',
          ownerType: 'user',
          accountType: AccountType.USER,
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          balance: '0.00',
          aggregateId: accountId,
          aggregateVersion: 1,
          correlationId: 'corr-1',
          homeRegionId: 'region-1',
        }),
        new BalanceChangedEvent({
          previousBalance: '0.00',
          newBalance: '200.00',
          changeAmount: '200.00',
          signedAmount: '200.00',
          changeType: 'CREDIT',
          reason: 'topup',
          transactionId: 'tx-1',
          aggregateId: accountId,
          aggregateVersion: 2,
          correlationId: 'corr-1',
        }),
      ];

      mockRepository.findOne.mockResolvedValue(projection);
      mockEventStore.getEvents.mockResolvedValue(events);

      const result = await service.reconcileAccount(accountId as any);

      expect(result.match).toBe(true);
      expect(result.issues.length).toBe(0);
    });
  });

  describe('Projection Rebuilding', () => {
    let service: AccountProjectionRebuildService;
    let mockEventStore: any;
    let mockRepository: any;

    beforeEach(async () => {
      mockEventStore = {
        getEvents: jest.fn(),
      };

      mockRepository = {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((data) => data),
      };

      const module = await Test.createTestingModule({
        providers: [
          AccountProjectionRebuildService,
          {
            provide: 'EVENT_STORE',
            useValue: mockEventStore,
          },
          {
            provide: getRepositoryToken(AccountProjection),
            useValue: mockRepository,
          },
        ],
      }).compile();

      service = module.get<AccountProjectionRebuildService>(
        AccountProjectionRebuildService,
      );
    });

    it('should rebuild projection from events', async () => {
      const accountId = 'acc-1';

      const corruptedProjection = {
        id: accountId,
        balance: '999.99',
        aggregateVersion: 1,
        status: AccountStatus.ACTIVE,
      };

      const events = [
        new AccountCreatedEvent({
          ownerId: 'owner-1',
          ownerType: 'user',
          accountType: AccountType.USER,
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          balance: '0.00',
          aggregateId: accountId,
          aggregateVersion: 1,
          correlationId: 'corr-1',
          homeRegionId: 'region-1',
        }),
        new BalanceChangedEvent({
          previousBalance: '0.00',
          newBalance: '100.00',
          changeAmount: '100.00',
          signedAmount: '100.00',
          changeType: 'CREDIT',
          reason: 'topup',
          transactionId: 'tx-1',
          aggregateId: accountId,
          aggregateVersion: 2,
          correlationId: 'corr-1',
        }),
      ];

      mockRepository.findOne
        .mockResolvedValueOnce(corruptedProjection)
        .mockResolvedValueOnce({
          ...corruptedProjection,
          balance: '100.00000000',
          aggregateVersion: 2,
        });

      mockEventStore.getEvents.mockResolvedValue(events);
      mockRepository.save.mockImplementation((proj: any) =>
        Promise.resolve(proj),
      );

      const result = await service.rebuildAccount(accountId as any);

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.balance).toBe('100.00000000');
      expect(result.aggregateVersion).toBe(2);
    });

    it('should throw error when no events found', async () => {
      const accountId = 'acc-1';
      mockEventStore.getEvents.mockResolvedValue([]);

      await expect(service.rebuildAccount(accountId as any)).rejects.toThrow(
        'No events found for account',
      );
    });
  });
});
