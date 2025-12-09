import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsPositiveAmount } from '../../../common/validation/amount.validator';

export class WithdrawalDto {
  @ApiProperty({
    description: 'Unique idempotency key to prevent duplicate transactions',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Source account ID (user account to withdraw from)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceAccountId!: string;

  @ApiProperty({
    description:
      'Destination account ID (external account where funds go, e.g., bank, wallet)',
    example: '223e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  destinationAccountId!: string;

  @ApiProperty({
    description: 'Amount to withdraw (positive decimal number as string)',
    example: '50.00',
  })
  @IsString()
  @IsNotEmpty()
  @IsPositiveAmount()
  @Transform(({ value }) => String(value))
  amount!: string;

  @ApiProperty({
    description: 'Currency code (must match account currency)',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({
    description: 'Optional reference or description for the transaction',
    example: 'Withdrawal to bank',
    required: false,
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty({
    description: 'Additional metadata for the transaction',
    example: { destination: 'bank_account', accountNumber: '****1234' },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string | number | boolean>;
}
