import { IEventHandler, CommandBus } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { SagaHandler } from '../../../cqrs/decorators/saga-handler.decorator';
import { SagaCoordinator } from '../../../cqrs/saga/saga-coordinator.service';
import { PaymentRequestedEvent } from '../events/payment-requested.event';
import { UpdateBalanceCommand } from '../../account/commands/update-balance.command';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { CompensateTransactionCommand } from '../commands/compensate-transaction.command';

/**
 * Saga Coordinator for Payment transactions
 *
 * Orchestrates the payment business process with compensation:
 * 1. DEBIT customer account
 * 2. CREDIT merchant account
 * 3. Complete transaction OR compensate on failure
 *
 * Implements compensating transactions for distributed consistency.
 */
@Injectable()
@SagaHandler(PaymentRequestedEvent)
export class PaymentRequestedHandler implements IEventHandler<PaymentRequestedEvent> {
  private readonly logger = new Logger(PaymentRequestedHandler.name);

  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: PaymentRequestedEvent): Promise<void> {
    // Start saga tracking with compensation steps
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'payment',
      correlationId: event.correlationId,
      steps: ['debit_customer', 'credit_merchant', 'complete_transaction'],
      metadata: event.metadata,
    });

    this.logger.log(
      `SAGA: Payment initiated [txId=${event.aggregateId}, customer=${event.customerAccountId}, ` +
        `merchant=${event.merchantAccountId}, amt=${event.amount} ${event.currency}]`,
    );

    let customerNewBalance: string | undefined;

    try {
      // Step 1: DEBIT the customer account
      const debitCommand = new UpdateBalanceCommand({
        accountId: event.customerAccountId,
        changeAmount: event.amount,
        changeType: 'DEBIT',
        reason: `Payment to merchant ${event.merchantAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      customerNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(debitCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'debit_customer',
        result: { customerNewBalance },
      });

      // Step 2: CREDIT the merchant account
      const creditCommand = new UpdateBalanceCommand({
        accountId: event.merchantAccountId,
        changeAmount: event.amount,
        changeType: 'CREDIT',
        reason: `Payment from customer ${event.customerAccountId} (tx: ${event.aggregateId})`,
        transactionId: event.aggregateId,
        correlationId: event.correlationId,
        actorId: event.metadata?.actorId,
      });

      const merchantNewBalance = await this.commandBus.execute<
        UpdateBalanceCommand,
        string
      >(creditCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'credit_merchant',
        result: { merchantNewBalance },
      });

      // Step 3: Complete the payment
      if (!customerNewBalance) {
        throw new Error('Customer balance update failed');
      }

      const completeCommand = new CompletePaymentCommand(
        event.aggregateId,
        customerNewBalance,
        merchantNewBalance,
        event.correlationId,
        event.metadata?.actorId,
      );

      await this.commandBus.execute(completeCommand);

      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { customerNewBalance, merchantNewBalance },
      });

      this.logger.log(
        `SAGA: Payment completed [txId=${event.aggregateId}, customerBal=${customerNewBalance}, merchantBal=${merchantNewBalance}]`,
      );
    } catch (error: unknown) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const failureStep = customerNewBalance
        ? 'credit_merchant'
        : 'debit_customer';
      const errorCode = (error as { code?: string })?.code;

      this.logger.error(
        `SAGA: Payment failed [txId=${event.aggregateId}, step=${failureStep}]`,
        errorObj.stack,
      );

      // Check if we need compensation (customer was debited)
      if (customerNewBalance) {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: true,
        });

        try {
          // COMPENSATION: Credit back the customer account
          const compensateUpdateCommand = new UpdateBalanceCommand({
            accountId: event.customerAccountId,
            changeAmount: event.amount,
            changeType: 'CREDIT',
            reason: `Compensation for failed payment ${event.aggregateId}`,
            transactionId: event.aggregateId,
            correlationId: event.correlationId,
            actorId: event.metadata?.actorId,
          });

          await this.commandBus.execute(compensateUpdateCommand);

          await this.sagaCoordinator.recordCompensation(
            event.aggregateId,
            'credit_customer_rollback',
            customerNewBalance,
          );

          // Mark transaction as compensated
          const compensateCommand = new CompensateTransactionCommand(
            event.aggregateId,
            `Payment failed after customer debit: ${errorObj.message}`,
            [
              {
                accountId: event.customerAccountId,
                action: 'CREDIT',
                amount: event.amount,
                reason:
                  'Rollback of customer debit due to merchant credit failure',
              },
            ],
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(compensateCommand);

          await this.sagaCoordinator.completeCompensation(event.aggregateId);

          this.logger.warn(
            `SAGA: Payment compensated [txId=${event.aggregateId}]`,
          );
        } catch (compensationError) {
          const compErrorStack =
            compensationError instanceof Error
              ? compensationError.stack
              : undefined;
          this.logger.error(
            `SAGA: COMPENSATION FAILED - MANUAL INTERVENTION REQUIRED [txId=${event.aggregateId}]`,
            compErrorStack,
          );

          // Still try to mark as failed
          try {
            const failCommand = new FailTransactionCommand(
              event.aggregateId,
              `Payment failed and compensation also failed: ${errorObj.message}`,
              'COMPENSATION_FAILED',
              event.correlationId,
              event.metadata?.actorId,
            );
            await this.commandBus.execute(failCommand);
          } catch (failError) {
            const failErrorStack =
              failError instanceof Error ? failError.stack : undefined;
            this.logger.error(
              `SAGA: Failed to mark as failed [txId=${event.aggregateId}]`,
              failErrorStack,
            );
          }
        }
      } else {
        // No compensation needed, just fail
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: failureStep,
          error: errorObj,
          canCompensate: false,
        });

        try {
          const failCommand = new FailTransactionCommand(
            event.aggregateId,
            errorObj.message,
            errorCode ?? 'PAYMENT_FAILED',
            event.correlationId,
            event.metadata?.actorId,
          );

          await this.commandBus.execute(failCommand);
        } catch (failError) {
          const failErrorStack =
            failError instanceof Error ? failError.stack : undefined;
          this.logger.error(
            `SAGA: Failed to mark payment as failed [txId=${event.aggregateId}]`,
            failErrorStack,
          );
        }
      }
    }
  }
}
