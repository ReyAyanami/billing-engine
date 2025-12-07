import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Get or generate correlation ID
    const correlationId = request.headers['x-correlation-id'] || uuidv4();

    // Add to request for later use
    request.correlationId = correlationId;

    // Add to response headers
    response.setHeader('X-Correlation-ID', correlationId);

    return next.handle();
  }
}

