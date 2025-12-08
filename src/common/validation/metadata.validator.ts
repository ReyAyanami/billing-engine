/**
 * Custom validators for metadata fields
 *
 * Provides class-validator decorators for validating metadata objects
 * in DTOs to ensure they only contain JSON-serializable values.
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  validateTransactionMetadata,
  validateAccountMetadata,
  validateEventMetadata,
} from './runtime-validators';

/**
 * Validator constraint for transaction metadata
 */
@ValidatorConstraint({ name: 'isValidTransactionMetadata', async: false })
export class IsValidTransactionMetadataConstraint implements ValidatorConstraintInterface {
  validate(metadata: unknown): boolean {
    const result = validateTransactionMetadata(metadata);
    return result.valid;
  }

  defaultMessage(args: ValidationArguments): string {
    const result = validateTransactionMetadata(args.value);
    return result.valid
      ? ''
      : `Transaction metadata validation failed: ${result.errors.join(', ')}`;
  }
}

/**
 * Decorator to validate transaction metadata
 */
export function IsValidTransactionMetadata(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsValidTransactionMetadataConstraint,
    });
  };
}

/**
 * Validator constraint for account metadata
 */
@ValidatorConstraint({ name: 'isValidAccountMetadata', async: false })
export class IsValidAccountMetadataConstraint implements ValidatorConstraintInterface {
  validate(metadata: unknown): boolean {
    const result = validateAccountMetadata(metadata);
    return result.valid;
  }

  defaultMessage(args: ValidationArguments): string {
    const result = validateAccountMetadata(args.value);
    return result.valid
      ? ''
      : `Account metadata validation failed: ${result.errors.join(', ')}`;
  }
}

/**
 * Decorator to validate account metadata
 */
export function IsValidAccountMetadata(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsValidAccountMetadataConstraint,
    });
  };
}

/**
 * Validator constraint for event metadata
 */
@ValidatorConstraint({ name: 'isValidEventMetadata', async: false })
export class IsValidEventMetadataConstraint implements ValidatorConstraintInterface {
  validate(metadata: unknown): boolean {
    const result = validateEventMetadata(metadata);
    return result.valid;
  }

  defaultMessage(args: ValidationArguments): string {
    const result = validateEventMetadata(args.value);
    return result.valid
      ? ''
      : `Event metadata validation failed: ${result.errors.join(', ')}`;
  }
}

/**
 * Decorator to validate event metadata
 */
export function IsValidEventMetadata(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsValidEventMetadataConstraint,
    });
  };
}
