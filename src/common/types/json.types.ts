/**
 * Type-safe JSON representations
 *
 * These types provide compile-time safety for JSON serialization/deserialization.
 * Use these instead of `any` when working with JSON data.
 */

/**
 * Primitive JSON values
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON array type
 */
export type JsonArray = JsonValue[];

/**
 * JSON object type
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Any valid JSON value
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Type guard: Check if value is a valid JSON primitive
 */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Type guard: Check if value is a valid JSON array
 */
export function isJsonArray(value: unknown): value is JsonArray {
  return Array.isArray(value) && value.every(isJsonValue);
}

/**
 * Type guard: Check if value is a valid JSON object
 */
export function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

/**
 * Type guard: Check if value is a valid JSON value
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return isJsonArray(value);
  }

  if (typeof value === 'object' && value !== null) {
    return isJsonObject(value);
  }

  return false;
}

/**
 * Safely parse JSON with type checking
 * @throws Error if JSON is invalid or doesn't match expected type
 */
export function parseJson(text: string): JsonValue {
  const parsed: unknown = JSON.parse(text);

  if (!isJsonValue(parsed)) {
    throw new Error('Invalid JSON structure');
  }

  return parsed;
}

/**
 * Safely stringify a value as JSON
 * @throws Error if value contains non-JSON-serializable data
 */
export function stringifyJson(value: JsonValue): string {
  return JSON.stringify(value);
}

/**
 * Get a nested value from a JSON object safely
 */
export function getJsonValue(
  obj: JsonObject,
  path: string[],
): JsonValue | undefined {
  let current: JsonValue = obj;

  for (const key of path) {
    if (
      typeof current === 'object' &&
      current !== null &&
      !Array.isArray(current)
    ) {
      current = current[key];
      if (current === undefined) {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return current;
}
