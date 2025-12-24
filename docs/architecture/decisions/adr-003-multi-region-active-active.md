# ADR-003: Multi-Region Active-Active Ledger with Reservation-Based Strategy

**Status**: Accepted  
**Date**: 2025-12-24  
**Authors**: System Architecture Team

---

## Context

The initial single-region design is a single point of failure and does not support global scale. To achieve high availability and low latency for global users, we need a multi-region architecture. However, active-active architectures in financial systems are notoriously difficult due to the "double-spend" problem and the need for strict consistency.

### The Problem

1.  **Latency**: Users in Europe accessing a US-East ledger experience high latency.
2.  **Availability**: A regional outage takes down the entire billing system.
3.  **Consistency**: Simply replicating specific databases leads to split-brain scenarios where the same funds are spent in two regions simultaneously (Double Spend).

### Requirements

- ✅ **Active-Active**: Read/Write capabilities in multiple regions simultaneously.
- ✅ **Strong Consistency**: Zero possibility of double-spending funds.
- ✅ **Causal Ordering**: Events must be ordered correctly across regions (HLC).
- ✅ **Partition Tolerance**: System must survive network partitions.

---

## Decision

Implement a **Multi-Region Active-Active Ledger** using a **Reservation-Based Strategy** for liquidity management and **Hybrid Logical Clocks (HLC)** for event ordering.

### Architecture Components

#### 1. Reservation-Based Liquidity Management (The "Allowance" Model)

Instead of a single global balance, an account's balance is treated as a "pool".

- **Global Event Store**: The "Source of Truth" is the aggregate history of all events across all regions.
- **Regional Reservation**: To spend funds in Region B, funds must first be "reserved" (moved) from the global pool to Region B's local reservation pool.
- **Strict Invariant**: `Debit(Amount)` in Region X is ONLY allowed if `LocalReservation(Region X) >= Amount`.

**Flow**:
1.  **Replenishment**: System (or user) requests to move funds to Region X.
2.  **Reservation**: `AccountAggregate` emits `BalanceReservedEvent` (allocating fund to Region X).
3.  **Execution**: Saga executes `UpdateBalanceCommand` (Debit) in Region X.
4.  **Invariant Check**: Aggregate confirms `RegionX_Reservation >= Debit_Amount` before applying change.

**Benefits**:
- **Solves Double Spend**: You cannot spend what you haven't reserved locally.
- **Decoupled latency**: Once funds are reserved, local transactions are fast (no global lock needed).

#### 2. Hybrid Logical Clock (HLC)

To order events across regions without a central clock, we use HLCs.

- **Structure**: `timestamp:logical_counter` (e.g., `167888888000:0005`).
- **Algorithm**:
    - `Send`: `hlc = max(local_hlc, wall_clock)`; message includes `hlc`.
    - `Receive`: `local_hlc = max(local_hlc, msg_hlc, wall_clock) + 1`.
- **Hashed Chains**: Every event includes the hash of the previous event + its own data (Tamper-Evidence).

**Benefits**:
- **Causal Consistency**: We know which events happened before others, even across regions.
- **Global Identity**: `RegionID + HLC` provides a globally unique, sortable Event ID.

#### 3. Cross-Region Replication

- **Async Replication**: `CrossRegionReplicatorService` consumes local Kafka events and publishes them to remote regions.
- **Conflict Resolution**: HLC determines the "winner" (though Reservation model avoids most business-logic conflicts).

---

## Consequences

### Positive
✅ **High Availability**: Regions can operate independently as long as they have reserved funds.
✅ **Low Latency**: Local transactions do not wait for global consensus.
✅ **Auditability**: HLC + Hash Chains provide a mathematically verifiable audit trail.

### Negative
❌ **Complexity**: Requires sophisticated liquidity management (moving funds between regions).
❌ **Liquidity Fragmentation**: Funds idle in Region A cannot be spent in Region B without a transfer.
