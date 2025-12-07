import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({ 
    description: 'External identifier of the account owner (e.g., user ID, organization ID)',
    example: 'user_12345'
  })
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ 
    description: 'Type of owner (e.g., user, organization, system)',
    example: 'user'
  })
  @IsString()
  @IsNotEmpty()
  ownerType: string;

  @ApiProperty({ 
    description: 'Currency code for this account',
    example: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH', 'POINTS']
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ 
    description: 'Additional metadata for the account',
    example: { accountName: 'Primary Account', category: 'savings' },
    required: false
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

