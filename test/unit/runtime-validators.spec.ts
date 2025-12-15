import {
  validateJsonValue,
  validateJsonObject,
  validateDeserializedEvent,
  validateUuid,
  validateAmount,
  validateCurrency,
  validateTimestamp,
  assertValid,
  parseJsonSafe,
  success,
  failure,
} from '../../src/common/validation/runtime-validators';

describe('Runtime Validators', () => {
  describe('success() and failure()', () => {
    it('should create success result', () => {
      const result = success();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should create failure result', () => {
      const result = failure(['Error 1', 'Error 2']);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Error 1', 'Error 2']);
    });
  });

  describe('validateJsonValue', () => {
    it('should accept null', () => {
      const result = validateJsonValue(null);
      expect(result.valid).toBe(true);
    });

    it('should accept undefined', () => {
      const result = validateJsonValue(undefined);
      expect(result.valid).toBe(true);
    });

    it('should accept strings', () => {
      const result = validateJsonValue('test');
      expect(result.valid).toBe(true);
    });

    it('should accept numbers', () => {
      expect(validateJsonValue(123).valid).toBe(true);
      expect(validateJsonValue(0).valid).toBe(true);
      expect(validateJsonValue(-45.67).valid).toBe(true);
    });

    it('should accept booleans', () => {
      expect(validateJsonValue(true).valid).toBe(true);
      expect(validateJsonValue(false).valid).toBe(true);
    });

    it('should accept valid arrays', () => {
      const result = validateJsonValue([1, 'two', true, null]);
      expect(result.valid).toBe(true);
    });

    it('should accept empty arrays', () => {
      const result = validateJsonValue([]);
      expect(result.valid).toBe(true);
    });

    it('should accept valid objects', () => {
      const result = validateJsonValue({
        a: 1,
        b: 'two',
        c: true,
        d: null,
      });
      expect(result.valid).toBe(true);
    });

    it('should accept nested objects and arrays', () => {
      const result = validateJsonValue({
        arr: [1, 2, 3],
        obj: { nested: 'value' },
        deep: { arr: [{ x: 1 }] },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject functions', () => {
      const result = validateJsonValue(() => console.log('test'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid JSON value type');
    });

    it('should accept Dates (they are JSON serializable)', () => {
      // Date objects have toJSON() method, so they're valid JSON values
      const result = validateJsonValue(new Date());
      expect(result.valid).toBe(true);
    });

    it('should reject symbols', () => {
      const result = validateJsonValue(Symbol('test'));
      expect(result.valid).toBe(false);
    });

    it('should reject arrays with functions', () => {
      const result = validateJsonValue([1, 2, () => 'test']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Array item at index 2');
    });

    it('should reject objects with function values', () => {
      const result = validateJsonValue({
        valid: 'test',
        invalid: () => console.log('test'),
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Property "invalid"');
    });

    it('should collect multiple errors for multiple invalid fields', () => {
      const result = validateJsonValue({
        bad1: () => 'fn1',
        good: 'valid',
        bad2: Symbol('test'),
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateJsonObject', () => {
    it('should accept valid object', () => {
      const result = validateJsonObject({ a: 1, b: 'test' });
      expect(result.valid).toBe(true);
    });

    it('should accept empty object', () => {
      const result = validateJsonObject({});
      expect(result.valid).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(validateJsonObject(null).valid).toBe(false);
      expect(validateJsonObject(undefined).valid).toBe(false);
      expect(validateJsonObject('string').valid).toBe(false);
      expect(validateJsonObject(123).valid).toBe(false);
      expect(validateJsonObject([]).valid).toBe(false);
    });

    it('should reject object with invalid values', () => {
      const result = validateJsonObject({
        valid: 'test',
        invalid: () => console.log('test'),
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDeserializedEvent', () => {
    const validEvent = {
      eventId: 'event-123',
      eventType: 'TestEvent',
      aggregateId: 'agg-123',
      aggregateType: 'Test',
      aggregateVersion: 1,
      timestamp: '2025-12-15T10:00:00.000Z',
      correlationId: 'corr-123',
    };

    it('should accept valid event', () => {
      const result = validateDeserializedEvent(validEvent);
      expect(result.valid).toBe(true);
    });

    it('should accept event with optional fields', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        causationId: 'cause-123',
        metadata: { actorId: 'user-123' },
      });
      expect(result.valid).toBe(true);
    });

    it('should accept event with null causationId', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        causationId: null,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object event', () => {
      const result = validateDeserializedEvent('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe('Event must be an object');
    });

    it('should reject event missing eventId', () => {
      const { eventId, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: eventId');
    });

    it('should reject event missing eventType', () => {
      const { eventType, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: eventType');
    });

    it('should reject event missing aggregateId', () => {
      const { aggregateId, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: aggregateId');
    });

    it('should reject event missing aggregateType', () => {
      const { aggregateType, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: aggregateType');
    });

    it('should reject event missing aggregateVersion', () => {
      const { aggregateVersion, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Missing required field: aggregateVersion',
      );
    });

    it('should reject event missing timestamp', () => {
      const { timestamp, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: timestamp');
    });

    it('should reject event missing correlationId', () => {
      const { correlationId, ...incomplete } = validEvent;
      const result = validateDeserializedEvent(incomplete);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: correlationId');
    });

    it('should reject event with invalid eventId type', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        eventId: 123,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('eventId must be a string');
    });

    it('should reject event with invalid aggregateVersion type', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        aggregateVersion: '1',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('aggregateVersion must be a number');
    });

    it('should reject event with invalid metadata', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        metadata: {
          actorId: 123, // Should be string
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Metadata'))).toBe(true);
    });

    it('should accept event with null metadata', () => {
      const result = validateDeserializedEvent({
        ...validEvent,
        metadata: null,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateUuid', () => {
    it('should accept valid UUID v4', () => {
      const result = validateUuid('550e8400-e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('should accept UUID in lowercase', () => {
      const result = validateUuid('550e8400-e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('should accept UUID in uppercase', () => {
      const result = validateUuid('550E8400-E29B-41D4-A716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('should accept UUID in mixed case', () => {
      const result = validateUuid('550e8400-E29B-41d4-A716-446655440000');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(validateUuid(123).valid).toBe(false);
      expect(validateUuid(null).valid).toBe(false);
      expect(validateUuid(undefined).valid).toBe(false);
      expect(validateUuid({}).valid).toBe(false);
    });

    it('should reject invalid UUID format', () => {
      expect(validateUuid('not-a-uuid').valid).toBe(false);
      expect(validateUuid('123').valid).toBe(false);
      expect(validateUuid('550e8400-e29b-41d4-a716').valid).toBe(false); // Too short
      expect(validateUuid('550e8400-e29b-41d4-a716-4466554400001').valid).toBe(
        false,
      ); // Too long
    });

    it('should reject UUID without hyphens', () => {
      const result = validateUuid('550e8400e29b41d4a716446655440000');
      expect(result.valid).toBe(false);
    });

    it('should reject UUID with wrong hyphen positions', () => {
      const result = validateUuid('550e84-00e29b-41d4-a716-446655440000');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should accept valid positive decimal', () => {
      expect(validateAmount('100.00').valid).toBe(true);
      expect(validateAmount('0.01').valid).toBe(true);
      expect(validateAmount('999999.99').valid).toBe(true);
    });

    it('should accept integer amounts', () => {
      expect(validateAmount('100').valid).toBe(true);
      expect(validateAmount('0').valid).toBe(true);
    });

    it('should accept negative amounts', () => {
      expect(validateAmount('-100.00').valid).toBe(true);
      expect(validateAmount('-0.01').valid).toBe(true);
    });

    it('should accept single decimal place', () => {
      const result = validateAmount('10.5');
      expect(result.valid).toBe(true);
    });

    it('should accept two decimal places', () => {
      const result = validateAmount('10.50');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(validateAmount(100).valid).toBe(false);
      expect(validateAmount(null).valid).toBe(false);
      expect(validateAmount(undefined).valid).toBe(false);
    });

    it('should reject invalid decimal format', () => {
      expect(validateAmount('abc').valid).toBe(false);
      expect(validateAmount('10.').valid).toBe(false);
      expect(validateAmount('.50').valid).toBe(false);
      expect(validateAmount('10.5.0').valid).toBe(false);
    });

    it('should reject more than 2 decimal places', () => {
      const result = validateAmount('10.555');
      expect(result.valid).toBe(false);
    });

    it('should reject amounts with letters', () => {
      expect(validateAmount('10.50USD').valid).toBe(false);
      expect(validateAmount('$10.50').valid).toBe(false);
    });
  });

  describe('validateCurrency', () => {
    it('should accept valid 3-letter currency codes', () => {
      expect(validateCurrency('USD').valid).toBe(true);
      expect(validateCurrency('EUR').valid).toBe(true);
      expect(validateCurrency('GBP').valid).toBe(true);
      expect(validateCurrency('JPY').valid).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(validateCurrency(123).valid).toBe(false);
      expect(validateCurrency(null).valid).toBe(false);
      expect(validateCurrency(undefined).valid).toBe(false);
    });

    it('should reject lowercase currency codes', () => {
      const result = validateCurrency('usd');
      expect(result.valid).toBe(false);
    });

    it('should reject mixed case currency codes', () => {
      const result = validateCurrency('Usd');
      expect(result.valid).toBe(false);
    });

    it('should reject codes shorter than 3 letters', () => {
      expect(validateCurrency('US').valid).toBe(false);
      expect(validateCurrency('U').valid).toBe(false);
    });

    it('should reject codes longer than 3 letters', () => {
      expect(validateCurrency('USDT').valid).toBe(false);
      expect(validateCurrency('EURO').valid).toBe(false);
    });

    it('should reject codes with numbers', () => {
      expect(validateCurrency('US1').valid).toBe(false);
      expect(validateCurrency('123').valid).toBe(false);
    });

    it('should reject codes with special characters', () => {
      expect(validateCurrency('US$').valid).toBe(false);
      expect(validateCurrency('U-D').valid).toBe(false);
    });
  });

  describe('validateTimestamp', () => {
    it('should accept valid ISO timestamp', () => {
      const result = validateTimestamp('2025-12-15T10:00:00.000Z');
      expect(result.valid).toBe(true);
    });

    it('should accept ISO timestamp without milliseconds', () => {
      const result = validateTimestamp('2025-12-15T10:00:00Z');
      expect(result.valid).toBe(true);
    });

    it('should accept ISO timestamp with timezone offset', () => {
      expect(validateTimestamp('2025-12-15T10:00:00+05:00').valid).toBe(true);
      expect(validateTimestamp('2025-12-15T10:00:00-08:00').valid).toBe(true);
    });

    it('should accept date-only string', () => {
      const result = validateTimestamp('2025-12-15');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string values', () => {
      expect(validateTimestamp(123).valid).toBe(false);
      expect(validateTimestamp(new Date()).valid).toBe(false);
      expect(validateTimestamp(null).valid).toBe(false);
    });

    it('should reject invalid date strings', () => {
      expect(validateTimestamp('not-a-date').valid).toBe(false);
      expect(validateTimestamp('2025-13-45').valid).toBe(false);
      expect(validateTimestamp('invalid').valid).toBe(false);
    });

    it('should reject empty string', () => {
      const result = validateTimestamp('');
      expect(result.valid).toBe(false);
    });
  });

  describe('assertValid', () => {
    it('should not throw for valid result', () => {
      const result = success();
      expect(() => assertValid(result, 'test')).not.toThrow();
    });

    it('should throw for invalid result', () => {
      const result = failure(['Error 1', 'Error 2']);
      expect(() => assertValid(result, 'test')).toThrow(
        'Validation failed for test: Error 1, Error 2',
      );
    });

    it('should include context in error message', () => {
      const result = failure(['Invalid value']);
      expect(() => assertValid(result, 'user input')).toThrow('user input');
    });
  });

  describe('parseJsonSafe', () => {
    it('should parse valid JSON', () => {
      const result = parseJsonSafe('{"a": 1, "b": "test"}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 1, b: 'test' });
      }
    });

    it('should parse JSON array', () => {
      const result = parseJsonSafe('[1, 2, 3]');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it('should parse JSON primitives', () => {
      expect(parseJsonSafe('"test"').success).toBe(true);
      expect(parseJsonSafe('123').success).toBe(true);
      expect(parseJsonSafe('true').success).toBe(true);
      expect(parseJsonSafe('null').success).toBe(true);
    });

    it('should return error for invalid JSON', () => {
      const result = parseJsonSafe('invalid json');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should return error for unclosed JSON', () => {
      const result = parseJsonSafe('{"a": 1');
      expect(result.success).toBe(false);
    });

    it('should validate parsed value with custom validator', () => {
      const validator = (value: unknown) => {
        if (typeof value === 'object' && value !== null && 'a' in value) {
          return success();
        }
        return failure(['Object must have property "a"']);
      };

      const result1 = parseJsonSafe('{"a": 1}', validator);
      expect(result1.success).toBe(true);

      const result2 = parseJsonSafe('{"b": 2}', validator);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error).toContain('property "a"');
      }
    });

    it('should return validation error when validator fails', () => {
      const validator = () => failure(['Custom validation failed']);

      const result = parseJsonSafe('{"valid": "json"}', validator);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Custom validation failed');
      }
    });

    it('should handle complex nested JSON', () => {
      const json = JSON.stringify({
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        meta: { count: 2 },
      });

      const result = parseJsonSafe(json);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('users');
        expect(result.data).toHaveProperty('meta');
      }
    });
  });

  describe('Integration Tests', () => {
    it('should validate complete event structure', () => {
      const event = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventType: 'PaymentCompleted',
        aggregateId: '550e8400-e29b-41d4-a716-446655440001',
        aggregateType: 'Payment',
        aggregateVersion: 1,
        timestamp: '2025-12-15T10:00:00.000Z',
        correlationId: '550e8400-e29b-41d4-a716-446655440002',
        amount: '100.00',
        currency: 'USD',
        metadata: {
          actorId: 'user-123',
          source: 'web',
        },
      };

      // Validate overall structure
      expect(validateDeserializedEvent(event).valid).toBe(true);

      // Validate individual fields
      expect(validateUuid(event.eventId).valid).toBe(true);
      expect(validateUuid(event.aggregateId).valid).toBe(true);
      expect(validateUuid(event.correlationId).valid).toBe(true);
      expect(validateAmount(event.amount).valid).toBe(true);
      expect(validateCurrency(event.currency).valid).toBe(true);
      expect(validateTimestamp(event.timestamp).valid).toBe(true);
    });

    it('should parse and validate JSON event', () => {
      const eventJson = JSON.stringify({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventType: 'TestEvent',
        aggregateId: '550e8400-e29b-41d4-a716-446655440001',
        aggregateType: 'Test',
        aggregateVersion: 1,
        timestamp: '2025-12-15T10:00:00.000Z',
        correlationId: '550e8400-e29b-41d4-a716-446655440002',
      });

      const parseResult = parseJsonSafe(eventJson, validateDeserializedEvent);
      expect(parseResult.success).toBe(true);
    });
  });
});

