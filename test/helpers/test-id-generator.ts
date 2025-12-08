import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

/**
 * Test ID Generator
 * 
 * Generates unique, valid UUIDs for test isolation.
 * Uses a namespace UUID to ensure test IDs don't collide with production data.
 */

// Namespace UUID for test data (generated once)
const TEST_NAMESPACE = '00000000-0000-0000-0000-000000000000';

// Unique test run ID (changes each time tests run)
const TEST_RUN_ID = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generate a unique, valid UUID for testing.
 * The UUID is deterministic based on the test run and a unique suffix.
 * 
 * @param suffix Optional suffix to make the ID unique within a test
 * @returns A valid UUID v5
 */
export function generateTestId(suffix?: string): string {
  const name = suffix ? `${TEST_RUN_ID}-${suffix}` : `${TEST_RUN_ID}-${uuidv4()}`;
  return uuidv5(name, TEST_NAMESPACE);
}

/**
 * Get the test run ID (useful for logging/debugging)
 */
export function getTestRunId(): string {
  return TEST_RUN_ID;
}

/**
 * Generate a correlation ID for a test
 */
export function generateTestCorrelationId(): string {
  return generateTestId('correlation');
}

