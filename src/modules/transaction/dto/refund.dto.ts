import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RefundDto {
  @ApiProperty({
    description: 'Unique idempotency key to prevent duplicate transactions',
    example: '880e8400-e29b-41d4-a716-446655440004',
    format: 'uuid'
  })
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiProperty({
    description: 'ID of the original transaction to refund',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid'
  })
  @IsUUID()
  @IsNotEmpty()
  originalTransactionId: string;

  @ApiProperty({
    description: 'Amount to refund (if partial refund). If not provided, full refund is performed',
    example: '25.00',
    required: false
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value !== undefined && value !== null ? String(value) : undefined)
  amount?: string;

  @ApiProperty({
    description: 'Reason for the refund',
    example: 'Customer requested refund',
    required: false
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'Additional metadata for the refund',
    example: { supportTicket: 'TICKET-123' },
    required: false
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

