/**
 * Runtime Validation Utilities
 *
 * Provides runtime validation for data that cannot be validated at compile time,
 * such as data from external sources, deserialized events, and API inputs.
 */

import { JsonValue } from '../types/json.types';
import {
  isObject,
  isString,
  isNumber,
  isBoolean,
  hasProperty,
} from '../utils/type-guards';

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Creates a successful validation result
 */
export function success(): ValidationResult {
  return { valid: true, errors: [] };
}

/**
 * Creates a failed validation result
 */
export function failure(errors: string[]): ValidationResult {
  return { valid: false, errors };
}

/**
 * Validates that a value is a valid JSON value
 */
export function validateJsonValue(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    return success();
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return success();
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const result = validateJsonValue(item);
      if (!result.valid) {
        errors.push(
          `Array item at index ${index}: ${result.errors.join(', ')}`,
        );
      }
    });
    return errors.length > 0 ? failure(errors) : success();
  }

  if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      const result = validateJsonValue(val);
      if (!result.valid) {
        errors.push(`Property "${key}": ${result.errors.join(', ')}`);
      }
    }
    return errors.length > 0 ? failure(errors) : success();
  }

  errors.push(`Invalid JSON value type: ${typeof value}`);
  return failure(errors);
}

/**
 * Validates that an object is a valid JsonObject
 */
export function validateJsonObject(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(value)) {
    return failure(['Value must be an object']);
  }

  const jsonResult = validateJsonValue(value);
  if (!jsonResult.valid) {
    errors.push(...jsonResult.errors);
  }

  return errors.length > 0 ? failure(errors) : success();
}

/**
 * Validates event metadata structure
 */
export function validateEventMetadata(metadata: unknown): ValidationResult {
  const errors: string[] = [];

  if (metadata === null || metadata === undefined) {
    return success(); // Metadata is optional
  }

  if (!isObject(metadata)) {
    return failure(['Metadata must be an object']);
  }

  // Validate optional standard fields
  if (hasProperty(metadata, 'actorId') && !isString(metadata.actorId)) {
    errors.push('actorId must be a string');
  }

  if (hasProperty(metadata, 'actorType') && !isString(metadata.actorType)) {
    errors.push('actorType must be a string');
  }

  if (hasProperty(metadata, 'ipAddress') && !isString(metadata.ipAddress)) {
    errors.push('ipAddress must be a string');
  }

  if (hasProperty(metadata, 'userAgent') && !isString(metadata.userAgent)) {
    errors.push('userAgent must be a string');
  }

  if (hasProperty(metadata, 'source') && !isString(metadata.source)) {
    errors.push('source must be a string');
  }

  // Validate that all values are JSON-serializable
  const jsonResult = validateJsonValue(metadata);
  if (!jsonResult.valid) {
    errors.push(...jsonResult.errors);
  }

  return errors.length > 0 ? failure(errors) : success();
}

/**
 * Validates a deserialized event from the event store
 */
export function validateDeserializedEvent(event: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(event)) {
    return failure(['Event must be an object']);
  }

  // Required fields
  const requiredFields = [
    'eventId',
    'eventType',
    'aggregateId',
    'aggregateType',
    'aggregateVersion',
    'timestamp',
    'correlationId',
  ];

  for (const field of requiredFields) {
    if (!hasProperty(event, field)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Type validation for required fields
  if (hasProperty(event, 'eventId') && !isString(event.eventId)) {
    errors.push('eventId must be a string');
  }

  if (hasProperty(event, 'eventType') && !isString(event.eventType)) {
    errors.push('eventType must be a string');
  }

  if (hasProperty(event, 'aggregateId') && !isString(event.aggregateId)) {
    errors.push('aggregateId must be a string');
  }

  if (hasProperty(event, 'aggregateType') && !isString(event.aggregateType)) {
    errors.push('aggregateType must be a string');
  }

  if (
    hasProperty(event, 'aggregateVersion') &&
    !isNumber(event.aggregateVersion)
  ) {
    errors.push('aggregateVersion must be a number');
  }

  if (hasProperty(event, 'timestamp') && !isString(event.timestamp)) {
    errors.push('timestamp must be a string');
  }

  if (hasProperty(event, 'correlationId') && !isString(event.correlationId)) {
    errors.push('correlationId must be a string');
  }

  // Optional fields
  if (
    hasProperty(event, 'causationId') &&
    event.causationId !== null &&
    event.causationId !== undefined &&
    !isString(event.causationId)
  ) {
    errors.push('causationId must be a string or null/undefined');
  }

  // Validate metadata if present
  if (hasProperty(event, 'metadata') && event.metadata !== null) {
    const metadataResult = validateEventMetadata(event.metadata);
    if (!metadataResult.valid) {
      errors.push(...metadataResult.errors.map((e) => `Metadata: ${e}`));
    }
  }

  // Validate entire event is JSON-serializable
  const jsonResult = validateJsonObject(event);
  if (!jsonResult.valid) {
    errors.push(...jsonResult.errors);
  }

  return errors.length > 0 ? failure(errors) : success();
}

/**
 * Validates transaction metadata
 */
export function validateTransactionMetadata(
  metadata: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (metadata === null || metadata === undefined) {
    return success(); // Metadata is optional
  }

  if (!isObject(metadata)) {
    return failure(['Metadata must be an object']);
  }

  // Validate all values are primitive JSON types
  for (const [key, value] of Object.entries(metadata)) {
    if (
      value !== null &&
      value !== undefined &&
      !isString(value) &&
      !isNumber(value) &&
      !isBoolean(value)
    ) {
      errors.push(
        `Metadata property "${key}" must be a string, number, or boolean`,
      );
    }
  }

  return errors.length > 0 ? failure(errors) : success();
}

/**
 * Validates account metadata
 */
export function validateAccountMetadata(metadata: unknown): ValidationResult {
  return validateTransactionMetadata(metadata); // Same rules apply
}

/**
 * Validates a UUID string
 */
export function validateUuid(value: unknown): ValidationResult {
  if (!isString(value)) {
    return failure(['Value must be a string']);
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(value)) {
    return failure(['Value must be a valid UUID']);
  }

  return success();
}

/**
 * Validates a decimal amount string
 */
export function validateAmount(value: unknown): ValidationResult {
  if (!isString(value)) {
    return failure(['Amount must be a string']);
  }

  // Check for valid decimal format
  const decimalRegex = /^-?\d+(\.\d{1,2})?$/;
  if (!decimalRegex.test(value)) {
    return failure(['Amount must be a valid decimal string (e.g., "10.50")']);
  }

  return success();
}

/**
 * Validates a currency code
 */
export function validateCurrency(value: unknown): ValidationResult {
  if (!isString(value)) {
    return failure(['Currency must be a string']);
  }

  // Check for valid 3-letter currency code
  const currencyRegex = /^[A-Z]{3}$/;
  if (!currencyRegex.test(value)) {
    return failure(['Currency must be a 3-letter code (e.g., "USD")']);
  }

  return success();
}

/**
 * Validates an ISO timestamp string
 */
export function validateTimestamp(value: unknown): ValidationResult {
  if (!isString(value)) {
    return failure(['Timestamp must be a string']);
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return failure(['Timestamp must be a valid ISO date string']);
  }

  return success();
}

/**
 * Helper to throw a validation error if validation fails
 */
export function assertValid(
  result: ValidationResult,
  context: string,
): asserts result is { valid: true; errors: [] } {
  if (!result.valid) {
    throw new Error(
      `Validation failed for ${context}: ${result.errors.join(', ')}`,
    );
  }
}

/**
 * Safe JSON parse with validation
 */
export function parseJsonSafe<T = JsonValue>(
  json: string,
  validator?: (value: unknown) => ValidationResult,
): { success: true; data: T } | { success: false; error: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(json);

    if (validator) {
      const result = validator(parsed);
      if (!result.valid) {
        return {
          success: false,
          error: `Validation failed: ${result.errors.join(', ')}`,
        };
      }
    }

    return { success: true, data: parsed as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
