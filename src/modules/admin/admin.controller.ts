import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AccountProjectionRebuildService } from '../account/services/account-projection-rebuild.service';
import { AccountReconciliationService } from '../account/services/account-reconciliation.service';
import { TransactionProjectionRebuildService } from '../transaction/services/transaction-projection-rebuild.service';
import { TransactionReconciliationService } from '../transaction/services/transaction-reconciliation.service';
import { AccountId, TransactionId } from '../../common/types/branded.types';

/**
 * Admin Controller for fault tolerance and maintenance operations.
 * These endpoints are typically protected and only accessible to administrators.
 */
@ApiTags('admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly accountRebuildService: AccountProjectionRebuildService,
    private readonly accountReconciliationService: AccountReconciliationService,
    private readonly transactionRebuildService: TransactionProjectionRebuildService,
    private readonly transactionReconciliationService: TransactionReconciliationService,
  ) {}

  @Post('accounts/:id/rebuild')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild account projection from events',
    description:
      'Reconstructs account projection from event store. Used for recovering from corruption.',
  })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Projection rebuilt successfully' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async rebuildAccount(@Param('id') accountId: string) {
    return await this.accountRebuildService.rebuildAccount(
      accountId as AccountId,
    );
  }

  @Post('accounts/rebuild-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild all account projections',
    description: 'Rebuilds ALL account projections. Use with caution!',
  })
  @ApiResponse({ status: 200, description: 'All projections rebuilt' })
  async rebuildAllAccounts() {
    return await this.accountRebuildService.rebuildAllAccounts();
  }

  @Get('accounts/:id/reconcile')
  @ApiOperation({
    summary: 'Reconcile account projection with events',
    description: 'Verifies account projection matches event-sourced state',
  })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 200, description: 'Reconciliation result' })
  async reconcileAccount(@Param('id') accountId: string) {
    return await this.accountReconciliationService.reconcileAccount(
      accountId as AccountId,
    );
  }

  @Get('accounts/reconcile-all')
  @ApiOperation({
    summary: 'Reconcile all accounts',
    description: 'Checks all account projections for inconsistencies',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation summary' })
  async reconcileAllAccounts() {
    return await this.accountReconciliationService.reconcileAllAccounts();
  }

  @Get('accounts/accounting-equation')
  @ApiOperation({
    summary: 'Verify accounting equation',
    description: 'Checks that total balance across all accounts is consistent',
  })
  @ApiResponse({ status: 200, description: 'Accounting equation verification' })
  async verifyAccountingEquation() {
    return await this.accountReconciliationService.verifyAccountingEquation();
  }

  @Post('transactions/:id/rebuild')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild transaction projection from events',
    description: 'Reconstructs transaction projection from event store',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Projection rebuilt successfully' })
  async rebuildTransaction(@Param('id') transactionId: string) {
    return await this.transactionRebuildService.rebuildTransaction(
      transactionId as TransactionId,
    );
  }

  @Post('transactions/rebuild-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild all transaction projections',
    description: 'Rebuilds ALL transaction projections. Use with caution!',
  })
  @ApiResponse({ status: 200, description: 'All projections rebuilt' })
  async rebuildAllTransactions() {
    return await this.transactionRebuildService.rebuildAllTransactions();
  }

  @Get('transactions/:id/reconcile')
  @ApiOperation({
    summary: 'Reconcile transaction projection with events',
    description: 'Verifies transaction projection matches event-sourced state',
  })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Reconciliation result' })
  async reconcileTransaction(@Param('id') transactionId: string) {
    return await this.transactionReconciliationService.reconcileTransaction(
      transactionId as TransactionId,
    );
  }

  @Get('transactions/reconcile-all')
  @ApiOperation({
    summary: 'Reconcile all transactions',
    description: 'Checks all transaction projections for inconsistencies',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation summary' })
  async reconcileAllTransactions() {
    return await this.transactionReconciliationService.reconcileAllTransactions();
  }

  @Get('transactions/stuck')
  @ApiOperation({
    summary: 'Find stuck transactions',
    description: 'Returns transactions that have been pending for too long',
  })
  @ApiResponse({ status: 200, description: 'List of stuck transactions' })
  async findStuckTransactions() {
    return await this.transactionReconciliationService.findStuckTransactions(5);
  }
}
