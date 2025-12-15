import { EventsHandler } from '@nestjs/cqrs';
import { Type } from '@nestjs/common';
import { IEvent } from '@nestjs/cqrs';

export const SAGA_HANDLER_METADATA = 'SAGA_HANDLER';
export const PROJECTION_HANDLER_METADATA = 'PROJECTION_HANDLER';

/**
 * Marks a handler as a Saga Coordinator
 *
 * Saga handlers:
 * - Process events synchronously and in order
 * - Coordinate business processes (orchestration)
 * - Should complete within milliseconds
 * - Must not depend on projections
 *
 * @example
 * ```typescript
 * @Injectable()
 * @SagaHandler(TopupRequestedEvent)
 * export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
 *   async handle(event: TopupRequestedEvent): Promise<void> {
 *     // Coordinate the topup saga
 *   }
 * }
 * ```
 */
export function SagaHandler(event: Type<IEvent>): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    // Mark as saga handler
    Reflect.defineMetadata(SAGA_HANDLER_METADATA, true, target as object);

    // Also register with NestJS CQRS
    EventsHandler(event)(target);
  };
}

/**
 * Marks a handler as a Projection Handler
 *
 * Projection handlers:
 * - Process events asynchronously
 * - Update read models (query-optimized views)
 * - Can be delayed/eventual
 * - Must be idempotent
 *
 * @example
 * ```typescript
 * @Injectable()
 * @ProjectionHandler(TopupRequestedEvent)
 * export class TopupRequestedProjectionHandler
 *   implements IEventHandler<TopupRequestedEvent> {
 *
 *   async handle(event: TopupRequestedEvent): Promise<void> {
 *     // Update read model
 *   }
 * }
 * ```
 */
export function ProjectionHandler(event: Type<IEvent>): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    // Mark as projection handler
    Reflect.defineMetadata(PROJECTION_HANDLER_METADATA, true, target as object);

    // Also register with NestJS CQRS
    EventsHandler(event)(target);
  };
}

/**
 * Check if a class is marked as a saga handler
 */
export function isSagaHandler(target: object): boolean {
  return Reflect.getMetadata(SAGA_HANDLER_METADATA, target) === true;
}

/**
 * Check if a class is marked as a projection handler
 */
export function isProjectionHandler(target: object): boolean {
  return Reflect.getMetadata(PROJECTION_HANDLER_METADATA, target) === true;
}
