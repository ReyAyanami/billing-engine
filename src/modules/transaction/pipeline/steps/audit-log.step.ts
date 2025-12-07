import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { AuditService } from '../../../audit/audit.service';

/**
 * Step: Create audit log entry
 */
@Injectable()
export class AuditLogStep extends TransactionStep {
  constructor(private readonly auditService: AuditService) {
    super();
  }

  async execute(context: TransactionContext): Promise<void> {
    const transaction = this.ensure(
      context.transaction,
      'Transaction not created',
    );
    const amountDecimal = this.ensure(
      context.amountDecimal,
      'Amount not calculated',
    );
    const sourceBalanceBefore = this.ensure(
      context.sourceBalanceBefore,
      'Source balance not calculated',
    );
    const sourceBalanceAfter = this.ensure(
      context.sourceBalanceAfter,
      'Source balance not calculated',
    );
    const destinationBalanceBefore = this.ensure(
      context.destinationBalanceBefore,
      'Destination balance not calculated',
    );
    const destinationBalanceAfter = this.ensure(
      context.destinationBalanceAfter,
      'Destination balance not calculated',
    );

    await this.auditService.log(
      'Transaction',
      transaction.id,
      context.type.toUpperCase(),
      {
        sourceAccountId: context.sourceAccountId,
        destinationAccountId: context.destinationAccountId,
        amount: amountDecimal.toString(),
        sourceBalanceBefore: sourceBalanceBefore.toString(),
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceBefore: destinationBalanceBefore.toString(),
        destinationBalanceAfter: destinationBalanceAfter.toString(),
      },
      context.operationContext,
    );
  }
}

