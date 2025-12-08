import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: any = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        errorResponse = exceptionResponse;
      } else {
        errorResponse = {
          error: {
            code: 'HTTP_EXCEPTION',
            message: exceptionResponse,
            timestamp: new Date().toISOString(),
            path: request.url,
          },
        };
      }
    } else if (exception instanceof Error) {
      // Log unexpected errors
      this.logger.error(
        `Unexpected error [path=${request.url}, method=${request.method}]`,
        exception.stack,
      );

      errorResponse = {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            process.env.NODE_ENV === 'development'
              ? exception.message
              : 'An unexpected error occurred',
          timestamp: new Date().toISOString(),
          path: request.url,
        },
      };
    }

    response.status(status).json(errorResponse);
  }
}
