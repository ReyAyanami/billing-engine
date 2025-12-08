import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class TransferDto {
  @ApiProperty({
    description: 'Unique idempotency key to prevent duplicate transactions',
    example: '770e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Source account ID (funds will be debited from this account)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  sourceAccountId!: string;

  @ApiProperty({
    description:
      'Destination account ID (funds will be credited to this account)',
    example: '456e7890-e89b-12d3-a456-426614174001',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  destinationAccountId!: string;

  @ApiProperty({
    description: 'Amount to transfer (positive decimal number as string)',
    example: '250.00',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value))
  amount!: string;

  @ApiProperty({
    description: 'Currency code (must match both accounts)',
    example: 'USD',
  })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty({
    description: 'Optional reference or description for the transfer',
    example: 'Payment for services',
    required: false,
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty({
    description: 'Additional metadata for the transfer',
    example: { invoiceId: 'INV-001', paymentMethod: 'internal_transfer' },
    required: false,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, string | number | boolean>;
}
