import { Command } from '../../../cqrs/base/command';
import { AccountStatus } from '../account.types';

/**
 * Parameters for UpdateAccountStatusCommand
 */
export interface UpdateAccountStatusCommandParams {
  accountId: string;
  newStatus: AccountStatus;
  reason: string;
  correlationId?: string;
  actorId?: string;
}

/**
 * Command to update an account's status.
 * This represents the intention to change account status in the system.
 *
 * Valid transitions:
 * - ACTIVE → SUSPENDED | CLOSED
 * - SUSPENDED → ACTIVE | CLOSED
 * - CLOSED → (terminal state, no transitions)
 */
export class UpdateAccountStatusCommand extends Command {
  public readonly accountId: string;
  public readonly newStatus: AccountStatus;
  public readonly reason: string;

  constructor(params: UpdateAccountStatusCommandParams) {
    super(params.correlationId, params.actorId);
    this.accountId = params.accountId;
    this.newStatus = params.newStatus;
    this.reason = params.reason;
  }
}
