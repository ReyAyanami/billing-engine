/**
 * Branded Types
 *
 * Branded types (also called nominal types or opaque types) provide compile-time
 * guarantees that values of specific semantic meaning aren't accidentally mixed up.
 *
 * For example, an AccountId and a TransactionId are both strings, but they represent
 * different things and shouldn't be used interchangeably.
 */

/**
 * Brand symbol used to create nominal types
 */
declare const brand: unique symbol;

/**
 * Brand a primitive type with a specific tag
 */
type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

/**
 * Account ID branded type
 * Ensures account IDs aren't confused with other IDs
 */
export type AccountId = Brand<string, 'AccountId'>;

/**
 * Transaction ID branded type
 * Ensures transaction IDs aren't confused with other IDs
 */
export type TransactionId = Brand<string, 'TransactionId'>;

/**
 * User/Owner ID branded type
 * Ensures owner IDs aren't confused with other IDs
 */
export type OwnerId = Brand<string, 'OwnerId'>;

/**
 * Currency code branded type
 * Ensures currency codes are properly validated
 */
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

/**
 * Amount (decimal string) branded type
 * Ensures amounts are properly formatted decimal strings
 */
export type DecimalAmount = Brand<string, 'DecimalAmount'>;

/**
 * Correlation ID branded type
 * Ensures correlation IDs are tracked properly
 */
export type CorrelationId = Brand<string, 'CorrelationId'>;

/**
 * Idempotency key branded type
 * Ensures idempotency keys are handled correctly
 */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

/**
 * Type guard to validate and brand an account ID
 */
export function isAccountId(value: string): value is AccountId {
  // UUID validation
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard to validate and brand a transaction ID
 */
export function isTransactionId(value: string): value is TransactionId {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard to validate and brand an owner ID
 */
export function isOwnerId(value: string): value is OwnerId {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard to validate and brand a currency code
 */
export function isCurrencyCode(value: string): value is CurrencyCode {
  const currencyRegex = /^[A-Z]{3}$/;
  return currencyRegex.test(value);
}

/**
 * Type guard to validate and brand a decimal amount
 */
export function isDecimalAmount(value: string): value is DecimalAmount {
  const decimalRegex = /^-?\d+(\.\d{1,2})?$/;
  return decimalRegex.test(value);
}

/**
 * Type guard to validate and brand a correlation ID
 */
export function isCorrelationId(value: string): value is CorrelationId {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Type guard to validate and brand an idempotency key
 */
export function isIdempotencyKey(value: string): value is IdempotencyKey {
  return value.length > 0 && value.length <= 255;
}

/**
 * Assert and cast to AccountId
 */
export function toAccountId(value: string): AccountId {
  if (!isAccountId(value)) {
    throw new Error(`Invalid AccountId: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to TransactionId
 */
export function toTransactionId(value: string): TransactionId {
  if (!isTransactionId(value)) {
    throw new Error(`Invalid TransactionId: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to OwnerId
 */
export function toOwnerId(value: string): OwnerId {
  if (!isOwnerId(value)) {
    throw new Error(`Invalid OwnerId: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to CurrencyCode
 */
export function toCurrencyCode(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new Error(`Invalid CurrencyCode: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to DecimalAmount
 */
export function toDecimalAmount(value: string): DecimalAmount {
  if (!isDecimalAmount(value)) {
    throw new Error(`Invalid DecimalAmount: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to CorrelationId
 */
export function toCorrelationId(value: string): CorrelationId {
  if (!isCorrelationId(value)) {
    throw new Error(`Invalid CorrelationId: ${value}`);
  }
  return value;
}

/**
 * Assert and cast to IdempotencyKey
 */
export function toIdempotencyKey(value: string): IdempotencyKey {
  if (!isIdempotencyKey(value)) {
    throw new Error(`Invalid IdempotencyKey: ${value}`);
  }
  return value;
}

/**
 * Unwrap branded type to string (for database operations, etc.)
 */
export function unwrap<T extends string>(branded: Brand<string, T>): string {
  return branded as string;
}
