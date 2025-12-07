import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class WithdrawalDto {
  @IsUUID()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value))
  amount: string;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

