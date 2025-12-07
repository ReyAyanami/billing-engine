import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transaction.entity';
import { AccountModule } from '../../account/account.module';
import { CurrencyModule } from '../../currency/currency.module';
import { AuditModule } from '../../audit/audit.module';

// Pipeline core
import { TransactionPipeline } from './transaction-pipeline';

// Pipeline steps
import { CheckIdempotencyStep } from './steps/check-idempotency.step';
import { LoadAndLockAccountsStep } from './steps/load-and-lock-accounts.step';
import { ValidateAccountsStep } from './steps/validate-accounts.step';
import { CalculateBalancesStep } from './steps/calculate-balances.step';
import { CreateTransactionStep } from './steps/create-transaction.step';
import { UpdateBalancesStep } from './steps/update-balances.step';
import { CompleteTransactionStep } from './steps/complete-transaction.step';
import { AuditLogStep } from './steps/audit-log.step';

/**
 * Pipeline Module
 * 
 * Provides transaction pipeline and reusable steps.
 * Import this module to use pipeline-based transaction processing.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    AccountModule,
    CurrencyModule,
    AuditModule,
  ],
  providers: [
    // Core pipeline
    TransactionPipeline,
    
    // Standard steps
    CheckIdempotencyStep,
    LoadAndLockAccountsStep,
    ValidateAccountsStep,
    CalculateBalancesStep,
    CreateTransactionStep,
    UpdateBalancesStep,
    CompleteTransactionStep,
    AuditLogStep,
  ],
  exports: [
    // Export pipeline for use in TransactionService
    TransactionPipeline,
    
    // Export steps for custom compositions
    CheckIdempotencyStep,
    LoadAndLockAccountsStep,
    ValidateAccountsStep,
    CalculateBalancesStep,
    CreateTransactionStep,
    UpdateBalancesStep,
    CompleteTransactionStep,
    AuditLogStep,
  ],
})
export class PipelineModule {}

