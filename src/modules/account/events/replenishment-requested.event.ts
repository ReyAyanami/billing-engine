import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Event emitted when a region's local reservation is low and needs replenishment.
 */
export class ReplenishmentRequestedEvent extends DomainEvent {
    readonly requestedAmount: string;
    readonly requestingRegionId: string;
    readonly homeRegionId: string;
    readonly currentAvailable: string;

    constructor(props: {
        requestedAmount: string;
        requestingRegionId: string;
        homeRegionId: string;
        currentAvailable: string;
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
        this.requestedAmount = props.requestedAmount;
        this.requestingRegionId = props.requestingRegionId;
        this.homeRegionId = props.homeRegionId;
        this.currentAvailable = props.currentAvailable;
    }

    getEventType(): string {
        return 'ReplenishmentRequestedEvent';
    }
}
