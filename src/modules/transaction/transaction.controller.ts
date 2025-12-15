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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { TransactionService } from './transaction.service';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { TransferDto } from './dto/transfer.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { DuplicateTransactionException } from '../../common/exceptions/billing.exception';
import { TransactionProjection } from './projections/transaction-projection.entity';
import { TransactionResult, TransferResult } from '../../common/types';
import { PaymentCommand } from './commands/payment.command';
import { RefundCommand } from './commands/refund.command';
import { v4 as uuidv4 } from 'uuid';
import {
  InvalidOperationException,
  CurrencyMismatchException,
  InsufficientBalanceException,
} from '../../common/exceptions/billing.exception';
import Decimal from 'decimal.js';
import {
  toTransactionId,
  toIdempotencyKey,
} from '../../common/types/branded.types';

@ApiTags('transactions')
@Controller('api/v1/transactions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly commandBus: CommandBus,
  ) {}

  @Post('topup')
  @ApiOperation({
    summary: 'Top-up account',
    description:
      'Add funds to an account. Returns immediately with pending status. Poll GET /transactions/:id to check completion. Uses CQRS/Event Sourcing with eventual consistency.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Top-up initiated (status: pending). Check transaction status via GET /transactions/:id',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or account inactive',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate transaction (idempotency key already used)',
  })
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
  @ApiOperation({
    summary: 'Withdraw from account',
    description:
      'Remove funds from an account. Returns immediately with pending status. Poll GET /transactions/:id to check completion. Uses CQRS/Event Sourcing with eventual consistency.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Withdrawal initiated (status: pending). Check transaction status via GET /transactions/:id',
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient balance or invalid input',
  })
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
  @ApiOperation({
    summary: 'Transfer between accounts',
    description:
      'Transfer funds between two accounts. Returns immediately with pending status. Poll GET /transactions/:id to check completion. Uses CQRS/Event Sourcing with eventual consistency.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Transfer initiated (status: pending). Check transaction status via GET /transactions/:id',
  })
  @ApiResponse({
    status: 400,
    description:
      'Insufficient balance, currency mismatch, or invalid operation',
  })
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
  @ApiOperation({
    summary: 'Process refund',
    description:
      'Process a refund from merchant to customer for a previous payment (B2C transaction). Returns immediately with pending status. Poll GET /transactions/:id to check completion. Supports partial and full refunds. Uses CQRS/Event Sourcing with eventual consistency and automatic compensation on failures.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Refund initiated (status: pending). Check transaction status via GET /transactions/:id',
    schema: {
      type: 'object',
      properties: {
        refundId: { type: 'string', format: 'uuid' },
        originalPaymentId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or refund amount exceeds original payment',
  })
  @ApiResponse({ status: 404, description: 'Original payment not found' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate transaction (idempotency key already used)',
  })
  async refund(
    @Body() dto: CreateRefundDto,
  ): Promise<{ refundId: string; originalPaymentId: string; status: string }> {
    const refundId = uuidv4();
    const correlationId = uuidv4();
    const idempotencyKey = dto.idempotencyKey || uuidv4();

    const existing = await this.transactionService.findByIdempotencyKey(
      toIdempotencyKey(idempotencyKey),
    );
    if (existing) {
      throw new DuplicateTransactionException(idempotencyKey, existing.id);
    }

    const command = new RefundCommand({
      refundId,
      originalPaymentId: dto.originalPaymentId,
      refundAmount: dto.refundAmount,
      currency: dto.currency,
      idempotencyKey,
      refundMetadata: dto.refundMetadata,
      correlationId,
      actorId: 'api',
    });

    await this.commandBus.execute(command);
    return {
      refundId,
      originalPaymentId: dto.originalPaymentId,
      status: 'pending',
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get transaction by ID',
    description: 'Retrieves detailed transaction information',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction found',
    type: TransactionProjection,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findById(@Param('id') id: string): Promise<TransactionProjection> {
    return await this.transactionService.findById(toTransactionId(id));
  }

  @Get()
  @ApiOperation({
    summary: 'Get transaction history',
    description: 'Retrieves paginated transaction history for an account',
  })
  @ApiQuery({ name: 'accountId', description: 'Account UUID', required: true })
  @ApiQuery({
    name: 'limit',
    description: 'Number of results (default: 50)',
    required: false,
  })
  @ApiQuery({
    name: 'offset',
    description: 'Pagination offset (default: 0)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions found',
    type: [TransactionProjection],
  })
  async findByAccount(
    @Query('accountId') accountId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<TransactionProjection[]> {
    return await this.transactionService.findAll({
      accountId,
      limit: limit || 50,
      offset: offset || 0,
    });
  }

  @Post('payment')
  @ApiOperation({
    summary: 'Process payment',
    description:
      'Process a payment from customer to merchant (C2B transaction). Returns immediately with pending status. Poll GET /transactions/:id to check completion. Uses CQRS/Event Sourcing with eventual consistency and automatic compensation on failures.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Payment initiated (status: pending). Check transaction status via GET /transactions/:id',
    schema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', format: 'uuid' },
        status: { type: 'string', example: 'pending' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 404,
    description: 'Customer or merchant account not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Duplicate transaction (idempotency key already used)',
  })
  async payment(
    @Body() dto: CreatePaymentDto,
  ): Promise<{ transactionId: string; status: string }> {
    const transactionId = uuidv4();
    const correlationId = uuidv4();
    const idempotencyKey = dto.idempotencyKey || uuidv4();

    const existing = await this.transactionService.findByIdempotencyKey(
      toIdempotencyKey(idempotencyKey),
    );
    if (existing) {
      throw new DuplicateTransactionException(idempotencyKey, existing.id);
    }

    const customerAccount = await this.transactionService.findAccountById(
      dto.customerAccountId,
    );
    const merchantAccount = await this.transactionService.findAccountById(
      dto.merchantAccountId,
    );

    if (!customerAccount) {
      throw new InvalidOperationException(
        `Customer account not found: ${dto.customerAccountId}`,
      );
    }
    if (!merchantAccount) {
      throw new InvalidOperationException(
        `Merchant account not found: ${dto.merchantAccountId}`,
      );
    }

    if (dto.customerAccountId === dto.merchantAccountId) {
      throw new InvalidOperationException(
        'Customer and merchant accounts must be different',
      );
    }

    if (customerAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(
        customerAccount.currency,
        dto.currency,
      );
    }
    if (merchantAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(
        merchantAccount.currency,
        dto.currency,
      );
    }

    const customerBalance = new Decimal(customerAccount.balance);
    const paymentAmount = new Decimal(dto.amount);
    if (customerBalance.lessThan(paymentAmount)) {
      throw new InsufficientBalanceException(
        dto.customerAccountId,
        customerBalance.toString(),
        paymentAmount.toString(),
      );
    }

    const command = new PaymentCommand({
      transactionId,
      customerAccountId: dto.customerAccountId,
      merchantAccountId: dto.merchantAccountId,
      amount: dto.amount,
      currency: dto.currency,
      idempotencyKey,
      paymentMetadata: dto.paymentMetadata,
      correlationId,
      actorId: 'api',
    });

    await this.commandBus.execute(command);
    return {
      transactionId,
      status: 'pending',
    };
  }
}
