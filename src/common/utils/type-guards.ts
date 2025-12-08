/**
 * Type guard utilities for runtime type validation
 *
 * Use these functions to safely narrow types from 'unknown' to specific types.
 * This is safer than type assertions (as Type) because it includes runtime checks.
 */

import {
  AccountStatus,
  AccountType,
} from '../../modules/account/account.entity';
import {
  TransactionStatus,
  TransactionType,
} from '../../modules/transaction/transaction.entity';

/**
 * Basic type guards
 */

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if an object has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K,
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Domain-specific type guards
 */

export function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === 'string' &&
    ['active', 'inactive', 'suspended', 'closed'].includes(value)
  );
}

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === 'string' &&
    ['user', 'merchant', 'external', 'system'].includes(value)
  );
}

export function isTransactionStatus(
  value: unknown,
): value is TransactionStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'completed', 'failed', 'compensated'].includes(value)
  );
}

export function isTransactionType(value: unknown): value is TransactionType {
  return (
    typeof value === 'string' &&
    ['topup', 'withdrawal', 'transfer', 'payment', 'refund'].includes(value)
  );
}

/**
 * Error type guards
 */

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function hasErrorCode(value: unknown): value is { code: string } {
  return isObject(value) && 'code' in value && isString(value['code']);
}

export function hasErrorMessage(value: unknown): value is { message: string } {
  return isObject(value) && 'message' in value && isString(value['message']);
}

/**
 * Get error message safely from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (hasErrorMessage(error)) {
    return error.message;
  }

  if (isString(error)) {
    return error;
  }

  return 'Unknown error';
}

/**
 * Get error code safely from unknown error
 */
export function getErrorCode(error: unknown): string | undefined {
  if (hasErrorCode(error)) {
    return error.code;
  }

  return undefined;
}

/**
 * Get error stack safely from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }

  return undefined;
}

/**
 * UUID validation
 */
export function isUUID(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Decimal string validation (for amounts)
 */
export function isDecimalString(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }

  const decimalRegex = /^-?\d+(\.\d+)?$/;
  return decimalRegex.test(value);
}

/**
 * Currency code validation (ISO 4217)
 */
export function isCurrencyCode(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }

  // Simple check: 3 uppercase letters
  return /^[A-Z]{3}$/.test(value);
}

/**
 * Assert that value is never reached (exhaustive check)
 * Use in switch statements to ensure all cases are handled
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * Assert that condition is true, otherwise throw error
 */
export function assert(
  condition: unknown,
  message?: string,
): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Assert that value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined');
  }
}

/**
 * Type guard for non-null values
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Filter array to only defined values
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined);
}

/**
 * Safe type cast with validation
 * Use this instead of 'as Type' when you need runtime validation
 */
export function cast<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  errorMessage?: string,
): T {
  if (guard(value)) {
    return value;
  }

  throw new Error(
    errorMessage || `Type cast failed: expected type, got ${typeof value}`,
  );
}
