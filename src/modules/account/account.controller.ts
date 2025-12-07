import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountStatusDto } from './dto/update-account-status.dto';
import { Account } from './account.entity';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('accounts')
@Controller('api/v1/accounts')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new account', description: 'Creates a new account for holding a specific currency' })
  @ApiResponse({ status: 201, description: 'Account created successfully', type: Account })
  @ApiResponse({ status: 400, description: 'Invalid input or currency not supported' })
  async create(@Body() createAccountDto: CreateAccountDto): Promise<Account> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system', // In production, get from auth context
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.accountService.create(createAccountDto, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID', description: 'Retrieves account details including balance and status' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Account found', type: Account })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findById(@Param('id') id: string): Promise<Account> {
    return await this.accountService.findById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get accounts by owner', description: 'Retrieves all accounts belonging to a specific owner' })
  @ApiQuery({ name: 'ownerId', description: 'Owner identifier', required: true })
  @ApiQuery({ name: 'ownerType', description: 'Owner type (e.g., user, organization)', required: true })
  @ApiResponse({ status: 200, description: 'Accounts found', type: [Account] })
  async findByOwner(
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: string,
  ): Promise<Account[]> {
    return await this.accountService.findByOwner(ownerId, ownerType);
  }

  @Get(':id/balance')
  @ApiOperation({ summary: 'Get account balance', description: 'Retrieves current balance and currency for an account' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getBalance(
    @Param('id') id: string,
  ): Promise<{ balance: string; currency: string; status: string }> {
    return await this.accountService.getBalance(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update account status', description: 'Changes account status (active, suspended, closed)' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully', type: Account })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateAccountStatusDto,
  ): Promise<Account> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system',
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.accountService.updateStatus(
      id,
      updateStatusDto.status,
      context,
    );
  }
}

