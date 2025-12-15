/**
 * Typed Test Response Utilities
 *
 * Provides type-safe wrappers for supertest responses to eliminate
 * 'any' types in test files and improve test code quality.
 */

import { Response } from 'supertest';

/**
 * Account response type
 */
export interface AccountResponse {
  id: string;
  ownerId: string;
  ownerType: string;
  accountType: string;
  currency: string;
  balance: string;
  status: string;
  maxBalance?: string;
  minBalance?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transaction response type
 */
export interface TransactionResponse {
  id: string;
  transactionId: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  fromAccountId?: string;
  toAccountId?: string;
  customerAccountId?: string;
  merchantAccountId?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payment response type
 */
export interface PaymentResponse extends TransactionResponse {
  customerAccountId: string;
  merchantAccountId: string;
  idempotencyKey: string;
}

/**
 * Refund response type
 */
export interface RefundResponse extends TransactionResponse {
  refundId: string;
  originalPaymentId: string;
  merchantAccountId: string;
  customerAccountId: string;
  refundAmount: string;
}

/**
 * Transfer response type
 */
export interface TransferResponse extends TransactionResponse {
  debitTransactionId: string;
  creditTransactionId: string;
}

/**
 * Error response type
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
    timestamp: string;
  };
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ErrorResponse).error === 'object'
  );
}

/**
 * Type guard to check if response is an account
 */
export function isAccountResponse(body: unknown): body is AccountResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'ownerId' in body &&
    'accountType' in body
  );
}

/**
 * Type guard to check if response is a transaction
 */
export function isTransactionResponse(
  body: unknown,
): body is TransactionResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    'transactionId' in body &&
    'type' in body
  );
}

/**
 * Extracts typed body from supertest response
 */
export function extractBody<T>(response: Response): T {
  return response.body as T;
}

/**
 * Asserts response is successful and returns typed body
 */
export function assertSuccess<T>(
  response: Response,
  expectedStatus: number = 200 | 201,
): T {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body as T;
}

/**
 * Asserts response is an error and returns typed error
 */
export function assertError(
  response: Response,
  expectedStatus?: number,
): ErrorResponse {
  if (expectedStatus && response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}`,
    );
  }

  if (!isErrorResponse(response.body)) {
    throw new Error('Response is not an error response');
  }

  return response.body;
}

/**
 * Safe response body extractor with validation
 */
export function safeExtractBody<T>(
  response: Response,
  validator: (body: unknown) => body is T,
): T {
  if (!validator(response.body)) {
    throw new Error(
      `Response body validation failed: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body;
}

/**
 * Helper to create account from response
 */
export function toAccount(response: Response): AccountResponse {
  return safeExtractBody(response, isAccountResponse);
}

/**
 * Helper to create transaction from response
 */
export function toTransaction(response: Response): TransactionResponse {
  return safeExtractBody(response, isTransactionResponse);
}

/**
 * Helper to create error from response
 */
export function toError(response: Response): ErrorResponse {
  return safeExtractBody(response, isErrorResponse);
}

/**
 * Helper to extract array of items from response
 */
export function extractArray<T>(response: Response): T[] {
  const body = response.body;
  if (!Array.isArray(body)) {
    throw new Error('Response body is not an array');
  }
  return body as T[];
}

/**
 * Helper to extract paginated response
 */
export function extractPaginated<T>(response: Response): PaginatedResponse<T> {
  const body = response.body;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error('Response body is not a paginated response');
  }
  return body as PaginatedResponse<T>;
}
