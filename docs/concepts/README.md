# Core Concepts

## Overview

This section explains the fundamental concepts and principles used throughout the billing engine. Perfect for understanding the "why" behind architectural decisions.

---

## Concepts

### [Accounts](./accounts.md)
Account types, lifecycle, and states.
- USER accounts (end-user wallets)
- EXTERNAL accounts (banks, gateways)
- SYSTEM accounts (fees, reserves)
- Account status transitions
- Balance limits

### [Transactions](./transactions.md)
Transaction types, states, and flows.
- Transaction lifecycle
- Status state machine
- Transaction types (topup, withdrawal, transfer, payment, refund)
- Double-entry principles
- Atomic operations

### [Idempotency](./idempotency.md)
Preventing duplicate operations.
- Why idempotency matters
- Idempotency key design
- Implementation strategies
- Retry handling
- Error scenarios

### [Locking](./locking.md)
Concurrency control and race condition prevention.
- Pessimistic locking strategy
- Lock ordering (deadlock prevention)
- SELECT FOR UPDATE pattern
- When to use locking
- Performance considerations

### [Audit Trail](./audit-trail.md)
Compliance and debugging.
- Event sourcing for audit
- Transaction history
- Balance verification
- Regulatory requirements
- Query patterns

---

## Related Documentation

- [Architecture](../architecture/) - System design and patterns
- [Operations](../operations/) - Transaction operations
- [Modules](../modules/) - Implementation details

