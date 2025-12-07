import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '../account.entity';

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
    description: 'Account type - determines behavior and limitations',
    example: 'user',
    enum: AccountType,
    default: AccountType.USER
  })
  @IsEnum(AccountType)
  @IsOptional()
  accountType?: AccountType;

  @ApiProperty({ 
    description: 'Account subtype for categorization (e.g., bank, payment_gateway, cash, wallet)',
    example: 'wallet',
    required: false
  })
  @IsString()
  @IsOptional()
  accountSubtype?: string;

  @ApiProperty({ 
    description: 'Currency code for this account',
    example: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'BTC', 'ETH', 'POINTS']
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ 
    description: 'Maximum balance allowed for this account (for user accounts with limits)',
    example: '10000.00',
    required: false
  })
  @IsNumberString()
  @IsOptional()
  maxBalance?: string;

  @ApiProperty({ 
    description: 'Minimum balance required for this account',
    example: '0.00',
    required: false
  })
  @IsNumberString()
  @IsOptional()
  minBalance?: string;

  @ApiProperty({ 
    description: 'Additional metadata for the account',
    example: { accountName: 'Primary Account', category: 'savings' },
    required: false
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

