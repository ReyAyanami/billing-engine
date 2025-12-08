import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Get or generate correlation ID
    const correlationId =
      (request.headers['x-correlation-id'] as string) || uuidv4();

    // Add to request for later use
    (request as any).correlationId = correlationId;

    // Add to response headers
    response.setHeader('X-Correlation-ID', correlationId);

    return next.handle();
  }
}
