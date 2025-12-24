import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AccountModule } from '../account/account.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [AccountModule, TransactionModule],
  controllers: [AdminController],
})
export class AdminModule {}
