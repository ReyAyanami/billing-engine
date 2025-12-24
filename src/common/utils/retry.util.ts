import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBackoff?: boolean;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  exponentialBackoff: true,
  retryableErrors: [
    'DEADLOCK',
    'CONNECTION_LOST',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'OptimisticLockException',
  ],
};

export class RetryUtil {
  private static readonly logger = new Logger(RetryUtil.name);

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    options: RetryOptions = {},
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (
          attempt === opts.maxAttempts ||
          !this.isRetryable(error, opts.retryableErrors)
        ) {
          this.logger.error(
            `${context} failed after ${attempt} attempt(s)`,
            error instanceof Error ? error.stack : String(error),
          );
          throw error;
        }

        const delay = this.calculateDelay(attempt, opts);
        this.logger.warn(
          `${context} failed (attempt ${attempt}/${opts.maxAttempts}). Retrying in ${delay}ms...`,
        );

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  private static isRetryable(error: any, retryableErrors: string[]): boolean {
    if (!error) return false;

    const errorCode = error.code || error.name || '';
    const errorMessage = error.message || '';

    return retryableErrors.some(
      (retryable) =>
        errorCode.includes(retryable) ||
        errorMessage.includes(retryable) ||
        error.constructor.name.includes(retryable),
    );
  }

  private static calculateDelay(
    attempt: number,
    options: Required<RetryOptions>,
  ): number {
    if (!options.exponentialBackoff) {
      return options.baseDelayMs;
    }

    const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, options.maxDelayMs);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
