/**
 * Exhaustive Type Checking Utilities
 *
 * Ensures all cases in a union type are handled, providing compile-time
 * safety when working with discriminated unions and enums.
 */

/**
 * Exhaustive check function
 *
 * Use this in switch statements or if-else chains to ensure all
 * possible values of a union type are handled.
 *
 * If a case is missed, TypeScript will show a compile error.
 * If this function is reached at runtime, it throws an error.
 *
 * @example
 * ```typescript
 * type Status = 'pending' | 'completed' | 'failed';
 *
 * function handleStatus(status: Status) {
 *   switch (status) {
 *     case 'pending':
 *       return 'Waiting...';
 *     case 'completed':
 *       return 'Done!';
 *     case 'failed':
 *       return 'Error!';
 *     default:
 *       return assertNever(status); // Compile error if case is missing
 *   }
 * }
 * ```
 */
export function assertNever(value: never): never {
  throw new Error(
    `Unhandled discriminated union member: ${JSON.stringify(value)}`,
  );
}

/**
 * Exhaustive check with custom error message
 */
export function assertNeverWithMessage(value: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/**
 * Type-safe enum exhaustiveness check
 *
 * Ensures all enum values are handled in a switch statement
 *
 * @example
 * ```typescript
 * enum Color { Red, Green, Blue }
 *
 * function colorName(color: Color): string {
 *   switch (color) {
 *     case Color.Red: return 'red';
 *     case Color.Green: return 'green';
 *     case Color.Blue: return 'blue';
 *     default: return assertUnreachable(color);
 *   }
 * }
 * ```
 */
export function assertUnreachable(value: never): never {
  throw new Error(
    `Unreachable code reached with value: ${JSON.stringify(value)}`,
  );
}

/**
 * Safe cast with exhaustive check
 *
 * Attempts to cast to a specific type and throws if unsuccessful
 */
export function safeCast<T>(value: unknown, typeName: string): T {
  // This is a runtime cast, compile-time checking should happen elsewhere
  if (value === null || value === undefined) {
    throw new Error(`Cannot cast null/undefined to ${typeName}`);
  }
  return value as T;
}

/**
 * Ensures all values in an object are handled
 *
 * Useful for ensuring configuration objects are complete
 */
export type ExhaustiveRecord<K extends string | number | symbol, V> = Record<
  K,
  V
>;

/**
 * Helper to ensure a switch or if-else covers all enum values
 * Returns a value for the default case that will cause a compile error if not exhaustive
 */
export const checkExhaustive = <T extends never>(value: T): T => value;

/**
 * Assert that a condition is true, narrowing the type
 *
 * @example
 * ```typescript
 * function process(value: string | number) {
 *   assert(typeof value === 'string', 'Expected string');
 *   // TypeScript knows value is string here
 *   return value.toUpperCase();
 * }
 * ```
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert a value is defined (not null or undefined)
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
 * Assert a value is of a specific type
 */
export function assertType<T>(
  value: unknown,
  typeGuard: (v: unknown) => v is T,
  typeName: string,
): asserts value is T {
  if (!typeGuard(value)) {
    throw new Error(`Expected value to be ${typeName}`);
  }
}
