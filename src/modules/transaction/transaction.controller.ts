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
import { CommandBus } from '@nestjs/cqrs';
import { TransactionService } from './transaction.service';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto } from './dto/refund.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { Transaction } from './transaction.entity';
import { TransactionResult, TransferResult } from '../../common/types';
import { PaymentCommand } from './commands/payment.command';
import { RefundCommand } from './commands/refund.command';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('transactions')
@Controller('api/v1/transactions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly commandBus: CommandBus,
  ) {}

  @Post('topup')
  @ApiOperation({ summary: 'Top-up account', description: 'Add funds to an account. Uses pipeline pattern for efficient processing.' })
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

    // Using pipeline-based implementation
    return await this.transactionService.topup(topupDto, context);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw from account', description: 'Remove funds from an account. Uses pipeline pattern for efficient processing.' })
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

    // Using pipeline-based implementation
    return await this.transactionService.withdraw(withdrawalDto, context);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer between accounts', description: 'Atomically transfer funds between two accounts. Uses pipeline pattern for efficient processing.' })
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

    // Using pipeline-based implementation
    return await this.transactionService.transfer(transferDto, context);
  }

  @Post('refund')
  @ApiOperation({
    summary: 'Process refund',
    description: 'Process a refund from merchant to customer for a previous payment (B2C transaction). Supports partial and full refunds. Uses CQRS/Event Sourcing with automatic compensation on failures.',
  })
  @ApiResponse({
    status: 201,
    description: 'Refund initiated successfully',
    schema: {
      type: 'object',
      properties: {
        refundId: { type: 'string', format: 'uuid' },
        originalPaymentId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input or refund amount exceeds original payment' })
  @ApiResponse({ status: 404, description: 'Original payment not found' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction (idempotency key already used)' })
  async refund(@Body() dto: CreateRefundDto): Promise<{ refundId: string; originalPaymentId: string; status: string }> {
    const refundId = uuidv4();
    const correlationId = uuidv4();
    const idempotencyKey = dto.idempotencyKey || uuidv4();

    const command = new RefundCommand(
      refundId,
      dto.originalPaymentId,
      dto.refundAmount,
      dto.currency,
      idempotencyKey,
      dto.refundMetadata,
      correlationId,
      'api', // actorId
    );

    await this.commandBus.execute(command);

    return {
      refundId,
      originalPaymentId: dto.originalPaymentId,
      status: 'pending',
    };
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

  @Post('payment')
  @ApiOperation({
    summary: 'Process payment',
    description: 'Process a payment from customer to merchant (C2B transaction). Uses CQRS/Event Sourcing with automatic compensation on failures.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment initiated successfully',
    schema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Customer or merchant account not found' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction (idempotency key already used)' })
  async payment(@Body() dto: CreatePaymentDto): Promise<{ transactionId: string; status: string }> {
    const transactionId = uuidv4();
    const correlationId = uuidv4();
    const idempotencyKey = dto.idempotencyKey || uuidv4();

    const command = new PaymentCommand(
      transactionId,
      dto.customerAccountId,
      dto.merchantAccountId,
      dto.amount,
      dto.currency,
      idempotencyKey,
      dto.paymentMetadata,
      correlationId,
      'api', // actorId
    );

    await this.commandBus.execute(command);

    return {
      transactionId,
      status: 'pending',
    };
  }
}

