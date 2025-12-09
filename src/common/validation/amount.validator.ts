import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import Decimal from 'decimal.js';

/**
 * Validates that a string represents a positive decimal amount.
 * Rejects:
 * - Negative numbers
 * - Zero
 * - Invalid decimal format
 * - Non-numeric strings
 */
export function IsPositiveAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveAmount',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          // Must be a string
          if (typeof value !== 'string') {
            return false;
          }

          try {
            const amount = new Decimal(value);
            
            // Must be positive (greater than zero)
            return amount.greaterThan(0);
          } catch {
            // Invalid decimal format
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a positive decimal amount (e.g., "10.50")`;
        },
      },
    });
  };
}

