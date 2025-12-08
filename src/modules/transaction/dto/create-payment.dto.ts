import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import type { PaymentMetadata } from '../../../common/types/metadata.types';

/**
 * DTO for creating a payment transaction.
 * Payment: Customer pays merchant for goods/services (C2B).
 */
export class CreatePaymentDto {
  @ApiProperty({
    description: 'Customer account ID (will be debited)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  customerAccountId!: string;

  @ApiProperty({
    description: 'Merchant account ID (will be credited)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty()
  merchantAccountId!: string;

  @ApiProperty({
    description: 'Payment amount (must be positive)',
    example: '99.99',
  })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  @IsNotEmpty()
  currency!: string;

  @ApiPropertyOptional({
    description: 'Idempotency key (auto-generated if not provided)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Payment metadata (order ID, invoice ID, etc.)',
    example: {
      orderId: 'ORDER-12345',
      invoiceId: 'INV-67890',
      description: 'Premium subscription payment',
      merchantReference: 'MERCH-REF-ABC',
    },
  })
  @IsObject()
  @IsOptional()
  paymentMetadata?: PaymentMetadata;
}
