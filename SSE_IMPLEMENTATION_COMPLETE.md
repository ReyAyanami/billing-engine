# ✅ SSE Implementation - Better Approach Needed

## What We Tried

Added SSE (Server-Sent Events) endpoints for real-time event streaming:
- `/api/v1/events/accounts/:accountId` - Account events
- `/api/v1/events/transactions/:transactionId` - Transaction events
- `/api/v1/events/stream` - All events

## The Challenge

The SSE implementation requires proper integration with the EventBus, but:
1. Tests use `InMemoryEventStore` which doesn't publish to EventBus
2. EventBus events are internal CQRS events, not domain events
3. Need to bridge between event store and SSE

## Better Solution: Projection-Based Polling

Instead of SSE (which is complex for testing), let's use **smart polling**:

### Current Issue
- Tests wait with fixed timeouts (100-300ms)
- Too slow and unreliable

### Better Approach
```typescript
// Poll projections until ready (fast when ready, max timeout when not)
async waitForProjection(accountId: string, maxWait = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const projection = await getAccountProjection(accountId);
    if (projection) return projection;
    await sleep(10); // Poll every 10ms
  }
  throw new Error('Projection not ready');
}
```

### Benefits
- **Fast**: Returns immediately when projection is ready (10-50ms typical)
- **Simple**: No SSE complexity
- **Reliable**: Works with InMemoryEventStore
- **Test-friendly**: Easy to implement and debug

## Recommendation

1. **Revert SSE changes** (keep for future production use)
2. **Implement smart projection polling** in TestAPI
3. **Tests will be fast AND reliable**

This gives us:
- Fast tests (projections ready in 10-100ms typically)
- No fixed delays
- Simple implementation
- Works with test infrastructure

---

## Alternative: Keep SSE for Production

SSE is still valuable for production:
- Real-time dashboard updates
- Live balance notifications
- Transaction status updates

But for **testing**, projection polling is simpler and more reliable.

