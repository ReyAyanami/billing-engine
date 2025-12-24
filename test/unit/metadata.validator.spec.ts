import {
  IsValidTransactionMetadataConstraint,
  IsValidAccountMetadataConstraint,
  IsValidEventMetadataConstraint,
} from '../../src/common/validation/metadata.validator';
import {
  validateTransactionMetadata,
  validateEventMetadata,
} from '../../src/common/validation/runtime-validators';

describe('Metadata Validators', () => {
  describe('Transaction Metadata Validation', () => {
    const validator = new IsValidTransactionMetadataConstraint();

    it('should accept valid transaction metadata with strings', () => {
      const metadata = {
        orderId: '12345',
        customerId: 'cust-999',
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept valid transaction metadata with numbers', () => {
      const metadata = {
        orderTotal: 12345,
        itemCount: 3,
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept valid transaction metadata with booleans', () => {
      const metadata = {
        isPremiumCustomer: true,
        isFirstPurchase: false,
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept valid transaction metadata with mixed types', () => {
      const metadata = {
        orderId: '12345',
        orderTotal: 99.99,
        isPremiumCustomer: true,
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept null or undefined metadata', () => {
      expect(validator.validate(null)).toBe(true);
      expect(validator.validate(undefined)).toBe(true);
    });

    it('should reject transaction metadata with nested objects', () => {
      const metadata = {
        orderId: '12345',
        customer: {
          id: 'cust-999',
          name: 'John Doe',
        },
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject transaction metadata with arrays', () => {
      const metadata = {
        orderId: '12345',
        items: ['item1', 'item2'],
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject transaction metadata with functions', () => {
      const metadata = {
        orderId: '12345',
        callback: () => console.log('test'),
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject non-object transaction metadata', () => {
      expect(validator.validate('not an object')).toBe(false);
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate(true)).toBe(false);
    });

    it('should provide error message for invalid metadata', () => {
      const metadata = {
        orderId: '12345',
        nestedObj: { invalid: 'data' },
      };

      const message = validator.defaultMessage({
        value: metadata,
      } as any);

      expect(message).toContain('Transaction metadata validation failed');
    });
  });

  describe('Account Metadata Validation', () => {
    const validator = new IsValidAccountMetadataConstraint();

    it('should accept valid account metadata', () => {
      const metadata = {
        accountPurpose: 'savings',
        taxId: '123-45-6789',
        verified: true,
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should reject invalid account metadata', () => {
      const metadata = {
        accountPurpose: 'savings',
        details: { nested: 'not allowed' },
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should provide error message for invalid metadata', () => {
      const metadata = {
        invalid: ['array', 'not', 'allowed'],
      };

      const message = validator.defaultMessage({
        value: metadata,
      } as any);

      expect(message).toContain('Account metadata validation failed');
    });
  });

  describe('Event Metadata Validation', () => {
    const validator = new IsValidEventMetadataConstraint();

    it('should accept valid event metadata with standard fields', () => {
      const metadata = {
        actorId: 'user-123',
        actorType: 'USER',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        source: 'web',
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept event metadata with custom fields', () => {
      const metadata = {
        actorId: 'user-123',
        customField: 'custom-value',
        timestamp: 1234567890,
      };

      expect(validator.validate(metadata)).toBe(true);
    });

    it('should accept null or undefined event metadata', () => {
      expect(validator.validate(null)).toBe(true);
      expect(validator.validate(undefined)).toBe(true);
    });

    it('should reject event metadata with invalid actorId type', () => {
      const metadata = {
        actorId: 12345, // Should be string
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject event metadata with invalid actorType type', () => {
      const metadata = {
        actorType: true, // Should be string
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject event metadata with invalid ipAddress type', () => {
      const metadata = {
        ipAddress: 192168, // Should be string
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject event metadata with invalid userAgent type', () => {
      const metadata = {
        userAgent: ['Mozilla'], // Should be string
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject event metadata with invalid source type', () => {
      const metadata = {
        source: { type: 'web' }, // Should be string
      };

      expect(validator.validate(metadata)).toBe(false);
    });

    it('should reject non-object event metadata', () => {
      expect(validator.validate('not an object')).toBe(false);
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate([])).toBe(false);
    });

    it('should provide error message for invalid metadata', () => {
      const metadata = {
        actorId: 123, // Invalid type
      };

      const message = validator.defaultMessage({
        value: metadata,
      } as any);

      expect(message).toContain('Event metadata validation failed');
    });
  });

  describe('Metadata Size and Type Validation', () => {
    it('should accept metadata with null values', () => {
      const metadata = {
        optionalField: null,
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with undefined values', () => {
      const metadata = {
        optionalField: undefined,
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with empty strings', () => {
      const metadata = {
        emptyField: '',
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with zero values', () => {
      const metadata = {
        count: 0,
        amount: 0.0,
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with negative numbers', () => {
      const metadata = {
        adjustment: -100,
        offset: -5.5,
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with large numbers', () => {
      const metadata = {
        largeValue: 999999999999,
        veryLarge: 1e10,
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with long strings', () => {
      const metadata = {
        description: 'a'.repeat(1000),
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should accept metadata with special characters in strings', () => {
      const metadata = {
        notes: 'Test with special chars: @#$%^&*(){}[]|\\<>?~`',
        unicode: '你好世界 🌍',
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should reject metadata with Date objects', () => {
      const metadata = {
        createdAt: new Date(),
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain(
        'must be a string, number, or boolean',
      );
    });

    it('should reject metadata with Symbol values', () => {
      const metadata = {
        sym: Symbol('test'),
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(false);
    });

    it('should reject metadata with BigInt values', () => {
      const metadata = {
        bigValue: BigInt(123),
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should accept empty object metadata', () => {
      const result = validateTransactionMetadata({});
      expect(result.valid).toBe(true);
    });

    it('should handle metadata with many keys', () => {
      const metadata: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        metadata[`key${i}`] = `value${i}`;
      }

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should reject metadata with deeply nested structures', () => {
      const metadata = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(false);
    });

    it('should provide specific error for each invalid field', () => {
      const metadata = {
        validField: 'test',
        invalidField1: { nested: 'object' },
        invalidField2: ['array'],
      };

      const result = validateTransactionMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Event Metadata Standard Fields', () => {
    it('should accept all standard event metadata fields', () => {
      const metadata = {
        actorId: 'user-123',
        actorType: 'USER',
        ipAddress: '192.168.1.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        source: 'web-app',
        customField: 'custom-value',
      };

      const result = validateEventMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should validate each standard field type correctly', () => {
      // Test each field individually
      expect(validateEventMetadata({ actorId: 'valid-string' }).valid).toBe(
        true,
      );
      expect(validateEventMetadata({ actorType: 'valid-string' }).valid).toBe(
        true,
      );
      expect(validateEventMetadata({ ipAddress: '127.0.0.1' }).valid).toBe(
        true,
      );
      expect(validateEventMetadata({ userAgent: 'Mozilla/5.0' }).valid).toBe(
        true,
      );
      expect(validateEventMetadata({ source: 'api' }).valid).toBe(true);
    });

    it('should collect all errors for multiple invalid fields', () => {
      const metadata = {
        actorId: 123, // Invalid
        actorType: true, // Invalid
        ipAddress: ['invalid'], // Invalid
        userAgent: { invalid: 'object' }, // Invalid
        source: 456, // Invalid
      };

      const result = validateEventMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('actorId'))).toBe(true);
      expect(result.errors.some((e) => e.includes('actorType'))).toBe(true);
    });
  });
});
