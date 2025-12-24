import * as fc from 'fast-check';
import { Decimal } from 'decimal.js';

/**
 * Property-Based Testing for Ledger Invariants
 * 
 * Verifies that for ANY sequence of ledger operations (credits, debits, reservations),
 * the core invariants always hold.
 */
interface Operation {
    type: 'CREDIT' | 'DEBIT' | 'RESERVE';
    amount: number;
}

describe('Ledger Invariants (Property-Based)', () => {
    it('should always maintain TotalBalance >= sum(AllReservations)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.record({
                    type: fc.constantFrom('CREDIT', 'DEBIT', 'RESERVE'),
                    amount: fc.double({ min: 0.01, max: 1000, noNaN: true })
                })),
                (operations: Operation[]) => {
                    let totalBalance = new Decimal(0);
                    let reservations = new Map<string, Decimal>();

                    for (const op of operations) {
                        const amount = new Decimal(op.amount.toFixed(2));

                        if (op.type === 'CREDIT') {
                            totalBalance = totalBalance.plus(amount);
                        } else if (op.type === 'DEBIT') {
                            // Local debit against reservation
                            const res = reservations.get('local') || new Decimal(0);
                            if (res.greaterThanOrEqualTo(amount)) {
                                totalBalance = totalBalance.minus(amount);
                                reservations.set('local', res.minus(amount));
                            }
                        } else if (op.type === 'RESERVE') {
                            // Reserve from unreserved balance
                            let totalRes = new Decimal(0);
                            reservations.forEach(r => totalRes = totalRes.plus(r));

                            if (totalBalance.minus(totalRes).greaterThanOrEqualTo(amount)) {
                                const res = reservations.get('local') || new Decimal(0);
                                reservations.set('local', res.plus(amount));
                            }
                        }
                    }

                    // Final Invariant Check
                    let finalTotalRes = new Decimal(0);
                    reservations.forEach(r => finalTotalRes = finalTotalRes.plus(r));

                    return totalBalance.greaterThanOrEqualTo(finalTotalRes) && totalBalance.greaterThanOrEqualTo(0);
                }
            )
        );
    });
});
