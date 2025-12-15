import { Controller, Sse, Query } from '@nestjs/common';
import { Observable, filter, map } from 'rxjs';
import { EventBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DomainEvent } from '../../cqrs/base/domain-event';

interface MessageEvent {
  data: {
    type: string;
    timestamp: string;
    payload: unknown;
    accountId?: string;
    transactionId?: string;
  };
}

/**
 * SSE Controller for real-time event streaming
 *
 * Allows clients to subscribe to account and transaction events in real-time.
 * Useful for:
 * - Live balance updates
 * - Transaction status notifications
 * - Real-time dashboard updates
 * - E2E testing without polling/timeouts
 */
@ApiTags('events')
@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly eventBus: EventBus) {}

  @Sse('accounts/:accountId')
  @ApiOperation({
    summary: 'Subscribe to account events',
    description: 'Stream real-time events for a specific account (SSE)',
  })
  @ApiQuery({ name: 'accountId', description: 'Account ID to subscribe to' })
  accountEvents(
    @Query('accountId') accountId: string,
  ): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus
        .pipe(
          filter((event: unknown) => {
            if (!(event instanceof DomainEvent)) return false;
            const eventData = event.toJSON();
            return (
              eventData['accountId'] === accountId ||
              eventData['sourceAccountId'] === accountId ||
              eventData['destinationAccountId'] === accountId
            );
          }),
          map((event: unknown) => {
            const domainEvent = event as DomainEvent;
            return {
              data: {
                type: domainEvent.getEventType(),
                accountId,
                timestamp: new Date().toISOString(),
                payload: domainEvent.toJSON(),
              },
            };
          }),
        )
        .subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }

  @Sse('transactions/:transactionId')
  @ApiOperation({
    summary: 'Subscribe to transaction events',
    description: 'Stream real-time events for a specific transaction (SSE)',
  })
  @ApiQuery({
    name: 'transactionId',
    description: 'Transaction ID to subscribe to',
  })
  transactionEvents(
    @Query('transactionId') transactionId: string,
  ): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus
        .pipe(
          filter((event: unknown) => {
            if (!(event instanceof DomainEvent)) return false;
            return event.aggregateId === transactionId;
          }),
          map((event: unknown) => {
            const domainEvent = event as DomainEvent;
            return {
              data: {
                type: domainEvent.getEventType(),
                transactionId,
                timestamp: new Date().toISOString(),
                payload: domainEvent.toJSON(),
              },
            };
          }),
        )
        .subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Subscribe to all events',
    description: 'Stream all system events in real-time (SSE)',
  })
  allEvents(): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus
        .pipe(
          map((event: unknown) => {
            const domainEvent = event as DomainEvent;
            return {
              data: {
                type: domainEvent.getEventType(),
                timestamp: new Date().toISOString(),
                payload: domainEvent.toJSON(),
              },
            };
          }),
        )
        .subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }
}
