import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a refund transaction.
 * Refund: Merchant returns money to customer for a previous payment.
 */
export class CreateRefundDto {
  @ApiProperty({
    description: 'Original payment transaction ID to refund',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  originalPaymentId: string;

  @ApiPropertyOptional({
    description: 'Refund amount (must be > 0 and ≤ remaining refundable amount). If not specified, full refund.',
    example: '99.99',
  })
  @IsString()
  @IsOptional()
  refundAmount?: string;

  @ApiProperty({
    description: 'Currency code (ISO 4217)',
    example: 'USD',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({
    description: 'Idempotency key (auto-generated if not provided)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Refund metadata (reason, type, notes, etc.)',
    example: {
      reason: 'Product return',
      refundType: 'full',
      notes: 'Customer returned defective product',
    },
  })
  @IsObject()
  @IsOptional()
  refundMetadata?: {
    reason?: string;
    refundType?: 'full' | 'partial';
    notes?: string;
    [key: string]: any;
  };
}

