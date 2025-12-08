import { Controller, Sse, Query, MessageEvent } from '@nestjs/common';
import { Observable, filter, map } from 'rxjs';
import { EventBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

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
    description: 'Stream real-time events for a specific account (SSE)' 
  })
  @ApiQuery({ name: 'accountId', description: 'Account ID to subscribe to' })
  accountEvents(@Query('accountId') accountId: string): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus.pipe(
        filter((event: any) => {
          // Filter events related to this account
          return event.accountId === accountId || 
                 event.sourceAccountId === accountId ||
                 event.destinationAccountId === accountId;
        }),
        map((event: any) => ({
          data: {
            type: event.constructor.name,
            accountId,
            timestamp: new Date().toISOString(),
            payload: event,
          },
        }))
      ).subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }

  @Sse('transactions/:transactionId')
  @ApiOperation({ 
    summary: 'Subscribe to transaction events', 
    description: 'Stream real-time events for a specific transaction (SSE)' 
  })
  @ApiQuery({ name: 'transactionId', description: 'Transaction ID to subscribe to' })
  transactionEvents(@Query('transactionId') transactionId: string): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus.pipe(
        filter((event: any) => {
          // Filter events related to this transaction
          return event.transactionId === transactionId || 
                 event.aggregateId === transactionId;
        }),
        map((event: any) => ({
          data: {
            type: event.constructor.name,
            transactionId,
            timestamp: new Date().toISOString(),
            payload: event,
          },
        }))
      ).subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }

  @Sse('stream')
  @ApiOperation({ 
    summary: 'Subscribe to all events', 
    description: 'Stream all system events in real-time (SSE)' 
  })
  allEvents(): Observable<MessageEvent> {
    return new Observable((observer) => {
      const subscription = this.eventBus.pipe(
        map((event: any) => ({
          data: {
            type: event.constructor.name,
            timestamp: new Date().toISOString(),
            payload: event,
          },
        }))
      ).subscribe((data) => observer.next(data));

      return () => subscription.unsubscribe();
    });
  }
}

