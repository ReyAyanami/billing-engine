import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { AccountModule } from '../account/account.module';
import { CurrencyModule } from '../currency/currency.module';
import { AuditModule } from '../audit/audit.module';
import { PipelineModule } from './pipeline/pipeline.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    AccountModule,
    CurrencyModule,
    AuditModule,
    PipelineModule, // Pipeline-based transaction processing
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}

