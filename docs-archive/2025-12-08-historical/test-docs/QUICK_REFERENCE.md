# E2E Testing Quick Reference Card

## 🚀 Quick Start

```bash
# Run POC tests
npm run test:e2e:new -- topup

# Run in watch mode
npm run test:e2e:new:watch -- topup

# Run all new tests
npm run test:e2e:new
```

## 📝 Test Template

```typescript
import { TestSetup } from '../../setup/test-setup';
import { TestAPI } from '../../helpers/test-api';

describe('Feature: My Feature', () => {
  let testApi: TestAPI;

  beforeAll(async () => {
    const app = await TestSetup.beforeAll();
    testApi = new TestAPI(app);
  });

  afterAll(() => TestSetup.afterAll());
  beforeEach(() => TestSetup.beforeEach());
  afterEach(() => TestSetup.afterEach());

  it('should work correctly', async () => {
    // GIVEN
    const account = await testApi.createAccount({ currency: 'USD' });
    
    // WHEN
    await testApi.topup(account.id, '100.00', 'USD');
    
    // THEN
    const balance = await testApi.getBalance(account.id);
    expect(balance.balance).toBe('100.00');
  });
});
```

## 🔧 TestAPI Methods

### Accounts

```typescript
// Create account
const account = await testApi.createAccount({
  currency: 'USD',           // Optional, default: 'USD'
  accountType: AccountType.USER,  // Optional
  maxBalance: '10000.00',    // Optional
});

// Create external account (for topup/withdrawal)
const external = await testApi.createExternalAccount('USD');

// Get account
const account = await testApi.getAccount(accountId);

// Get balance only
const { balance, currency, status } = await testApi.getBalance(accountId);

// Update status
await testApi.updateAccountStatus(accountId, AccountStatus.SUSPENDED);
```

### Transactions

```typescript
// Top-up
const tx = await testApi.topup(accountId, '100.00', 'USD', {
  idempotencyKey: 'optional-key',
  reference: 'Optional reference',
});

// Withdrawal
const tx = await testApi.withdraw(accountId, '50.00', 'USD');

// Transfer
const tx = await testApi.transfer(fromId, toId, '30.00', 'USD');

// Payment
const tx = await testApi.payment(customerId, merchantId, '99.99', 'USD', {
  metadata: { orderId: 'ORDER-123' },
});

// Refund
const tx = await testApi.refund(originalTxId, '99.99', {
  reason: 'Customer request',
});

// Get transaction
const tx = await testApi.getTransaction(transactionId);
```

### Utilities

```typescript
// Generate unique ID
const id = testApi.generateId('my-prefix');
// Returns: "test-my-prefix-<uuid>"
```

## 📋 Common Patterns

### Pattern 1: Happy Path

```typescript
it('should work in normal case', async () => {
  // GIVEN: Setup
  const account = await testApi.createAccount({ currency: 'USD' });
  
  // WHEN: Action
  await testApi.topup(account.id, '100.00', 'USD');
  
  // THEN: Verify
  const balance = await testApi.getBalance(account.id);
  expect(balance.balance).toBe('100.00');
});
```

### Pattern 2: Error Case

```typescript
it('should reject invalid input', async () => {
  // GIVEN
  const account = await testApi.createAccount({ currency: 'USD' });
  
  // WHEN/THEN: Should throw
  await expect(
    testApi.topup(account.id, '100.00', 'EUR')
  ).rejects.toThrow();
});
```

### Pattern 3: Multiple Steps

```typescript
it('should handle complex flow', async () => {
  // GIVEN: Two accounts
  const sender = await testApi.createAccount({ currency: 'USD' });
  const receiver = await testApi.createAccount({ currency: 'USD' });
  
  // AND: Sender has funds
  await testApi.topup(sender.id, '100.00', 'USD');
  
  // WHEN: Transfer
  await testApi.transfer(sender.id, receiver.id, '50.00', 'USD');
  
  // THEN: Both balances updated
  expect((await testApi.getBalance(sender.id)).balance).toBe('50.00');
  expect((await testApi.getBalance(receiver.id)).balance).toBe('50.00');
});
```

### Pattern 4: Idempotency

```typescript
it('should handle duplicate requests', async () => {
  // GIVEN
  const account = await testApi.createAccount({ currency: 'USD' });
  const key = testApi.generateId('idempotency');
  
  // WHEN: Same request twice
  const tx1 = await testApi.topup(account.id, '100.00', 'USD', {
    idempotencyKey: key,
  });
  const tx2 = await testApi.topup(account.id, '100.00', 'USD', {
    idempotencyKey: key,
  });
  
  // THEN: Same transaction returned
  expect(tx1.id).toBe(tx2.id);
  expect((await testApi.getBalance(account.id)).balance).toBe('100.00');
});
```

## ✅ Best Practices

### DO ✅

```typescript
// ✅ Descriptive test names
it('should reject top-up with wrong currency', () => {});

// ✅ Clear Given-When-Then structure
// GIVEN: ...
// WHEN: ...
// THEN: ...

// ✅ Test business outcomes
expect(balance.balance).toBe('100.00');

// ✅ Use TestAPI for all operations
await testApi.topup(...);

// ✅ Independent tests
beforeEach(() => TestSetup.beforeEach()); // Isolation
```

### DON'T ❌

```typescript
// ❌ Vague test names
it('test 1', () => {});

// ❌ Test implementation details
expect(saga.step1Completed).toBe(true);

// ❌ Share state between tests
let sharedAccount; // No!

// ❌ Bypass TestAPI
await commandBus.execute(...); // No!

// ❌ Hard-coded IDs
const accountId = '123-456'; // No!
```

## 🐛 Debugging

### Test Fails

```typescript
// 1. Check error message (should be clear)
// 2. Add logging if needed
console.log('Account:', await testApi.getAccount(accountId));
console.log('Transaction:', await testApi.getTransaction(txId));

// 3. Verify state
const balance = await testApi.getBalance(accountId);
console.log('Current balance:', balance.balance);
```

### Test Hangs

```typescript
// 1. Check timeout (default 30s per test)
it('should work', async () => {
  // test code
}, 60000); // Increase timeout to 60s

// 2. Verify saga completes
// TestAPI handles waiting, but you can verify manually
const tx = await testApi.getTransaction(txId);
console.log('Status:', tx.status);
```

### Transaction Isolation Issues

```typescript
// Ensure beforeEach/afterEach are set up correctly
beforeEach(async () => {
  await TestSetup.beforeEach(); // Start transaction
});

afterEach(async () => {
  await TestSetup.afterEach(); // Rollback transaction
});
```

## 📊 Test Structure

```
test/e2e-new/
├── setup/
│   └── test-setup.ts              # Use: TestSetup class
│
├── helpers/
│   └── test-api.ts                # Use: TestAPI class
│
└── features/
    ├── accounts/
    │   └── *.e2e.spec.ts         # Account tests
    │
    └── transactions/
        ├── topup.e2e.spec.ts     # ← START HERE (POC)
        ├── withdrawal.e2e.spec.ts
        ├── transfer.e2e.spec.ts
        ├── payment.e2e.spec.ts
        └── refund.e2e.spec.ts
```

## 💡 Tips

1. **Copy from POC**: Use `topup.e2e.spec.ts` as template
2. **Test outcomes**: Not implementation
3. **Keep it simple**: Let TestAPI handle complexity
4. **Use TypeScript**: Types will guide you
5. **Read errors**: They should be clear

## 📚 More Info

- **Full Strategy**: `docs/E2E_TESTING_STRATEGY.md`
- **README**: `test/e2e-new/README.md`
- **POC Example**: `test/e2e-new/features/transactions/topup.e2e.spec.ts`

## 🎯 Common Assertions

```typescript
// Transaction status
expect(tx.status).toBe(TransactionStatus.COMPLETED);

// Balance checks
expect(balance.balance).toBe('100.00');

// Account status
expect(account.status).toBe(AccountStatus.ACTIVE);

// Currency
expect(account.currency).toBe('USD');

// Error cases
await expect(action()).rejects.toThrow();
await expect(action()).rejects.toThrow('CURRENCY_MISMATCH');

// Object properties
expect(tx.sourceAccountId).toBe(sourceId);
expect(tx.destinationAccountId).toBe(destId);
expect(tx.amount).toBe('100.00');

// Idempotency
expect(tx1.id).toBe(tx2.id); // Same transaction
```

## ⚡ Quick Checks

Before committing:
- [ ] All tests pass
- [ ] Test names are descriptive
- [ ] Using Given-When-Then structure
- [ ] No shared state between tests
- [ ] Using TestAPI (not direct CommandBus)
- [ ] Tests are independent
- [ ] No hard-coded IDs
- [ ] Error cases covered

---

**Need Help?** Check the full documentation or ask the team!

