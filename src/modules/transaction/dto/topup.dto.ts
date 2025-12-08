import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsPositive,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TopupDto {
  @ApiProperty({
    description: 'Unique idempotency key to prevent duplicate transactions',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    description:
      'Source account ID (external account where funds come from, e.g., bank, payment gateway)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceAccountId: string;

  @ApiProperty({
    description: 'Destination account ID (user account to top-up)',
    example: '223e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  destinationAccountId: string;

  @ApiProperty({
    description: 'Amount to add (positive decimal number as string)',
    example: '100.50',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value))
  amount: string;

  @ApiProperty({
    description: 'Currency code (must match account currency)',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({
    description: 'Optional reference or description for the transaction',
    example: 'Initial deposit',
    required: false,
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty({
    description: 'Additional metadata for the transaction',
    example: { source: 'bank_transfer', bankReference: 'TXN123456' },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
