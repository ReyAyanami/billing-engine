import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RefundDto {
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsUUID()
  @IsNotEmpty()
  originalTransactionId: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => String(value))
  amount?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

