import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ValidationPipe,
  UsePipes,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto } from './dto/refund.dto';
import { Transaction } from './transaction.entity';
import { TransactionResult, TransferResult } from '../../common/types';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('transactions')
@Controller('api/v1/transactions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('topup')
  @ApiOperation({ summary: 'Top-up account', description: 'Add funds to an account. Requires unique idempotency key.' })
  @ApiResponse({ status: 201, description: 'Top-up successful' })
  @ApiResponse({ status: 400, description: 'Invalid input or account inactive' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction (idempotency key already used)' })
  async topup(@Body() topupDto: TopupDto): Promise<TransactionResult> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system',
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.transactionService.topup(topupDto, context);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw from account', description: 'Remove funds from an account. Checks for sufficient balance.' })
  @ApiResponse({ status: 201, description: 'Withdrawal successful' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid input' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction' })
  async withdraw(
    @Body() withdrawalDto: WithdrawalDto,
  ): Promise<TransactionResult> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system',
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.transactionService.withdraw(withdrawalDto, context);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer between accounts', description: 'Atomically transfer funds between two accounts using double-entry bookkeeping.' })
  @ApiResponse({ status: 201, description: 'Transfer successful' })
  @ApiResponse({ status: 400, description: 'Insufficient balance, currency mismatch, or invalid operation' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction' })
  async transfer(@Body() transferDto: TransferDto): Promise<TransferResult> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system',
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.transactionService.transfer(transferDto, context);
  }

  @Post('refund')
  @ApiOperation({ summary: 'Refund a transaction', description: 'Refund a previous transaction (full or partial). Updates original transaction status.' })
  @ApiResponse({ status: 201, description: 'Refund successful' })
  @ApiResponse({ status: 400, description: 'Invalid refund (amount exceeds original, transaction not refundable)' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 409, description: 'Duplicate refund' })
  async refund(@Body() refundDto: RefundDto): Promise<TransactionResult> {
    const context = {
      correlationId: uuidv4(),
      actorId: 'system',
      actorType: 'api',
      timestamp: new Date(),
    };

    return await this.transactionService.refund(refundDto, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID', description: 'Retrieves detailed transaction information' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction found', type: Transaction })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findById(@Param('id') id: string): Promise<Transaction> {
    return await this.transactionService.findById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get transaction history', description: 'Retrieves paginated transaction history for an account' })
  @ApiQuery({ name: 'accountId', description: 'Account UUID', required: true })
  @ApiQuery({ name: 'limit', description: 'Number of results (default: 50)', required: false })
  @ApiQuery({ name: 'offset', description: 'Pagination offset (default: 0)', required: false })
  @ApiResponse({ status: 200, description: 'Transactions found', type: [Transaction] })
  async findByAccount(
    @Query('accountId') accountId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<Transaction[]> {
    return await this.transactionService.findAll({
      accountId,
      limit: limit || 50,
      offset: offset || 0,
    });
  }
}

