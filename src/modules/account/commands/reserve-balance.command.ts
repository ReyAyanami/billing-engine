import { Command } from '../../../cqrs/base/command';

/**
 * Command to request a balance reservation for a specific region.
 */
export class ReserveBalanceCommand extends Command {
  public readonly accountId: string;
  public readonly amount: string;
  public readonly targetRegionId: string;
  public readonly reason: string;
  public readonly causationId?: string;
  public readonly metadata?: Record<
    string,
    string | number | boolean | undefined
  >;

  constructor(params: {
    accountId: string;
    amount: string;
    targetRegionId: string;
    reason: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }) {
    super(params.correlationId);
    this.accountId = params.accountId;
    this.amount = params.amount;
    this.targetRegionId = params.targetRegionId;
    this.reason = params.reason;
    this.causationId = params.causationId;
    this.metadata = params.metadata;
  }
}
