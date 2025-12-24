import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Event emitted when a balance reservation is successfully allocated to a region.
 */
export class BalanceReservedEvent extends DomainEvent {
    readonly amount: string;
    readonly targetRegionId: string;
    readonly newTotalReserved: string;

    constructor(props: {
        amount: string;
        targetRegionId: string;
        newTotalReserved: string;
        aggregateId: string;
        aggregateVersion: number;
        correlationId: string;
        causationId?: string;
        metadata?: Record<string, string | number | boolean | undefined>;
    }) {
        super({
            ...props,
            aggregateType: 'Account',
        });
        this.amount = props.amount;
        this.targetRegionId = props.targetRegionId;
        this.newTotalReserved = props.newTotalReserved;
    }

    getEventType(): string {
        return 'BalanceReservedEvent';
    }
}
