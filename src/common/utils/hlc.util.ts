/**
 * Hybrid Logical Clock (HLC) implementation.
 *
 * HLC provides global ordering of events in a distributed system without
 * requiring perfectly synchronized physical clocks.
 *
 * It combines physical time and a logical counter to ensure:
 * 1. Monotonicity: Clock always moves forward.
 * 2. Causal Ordering: If event A causes event B, HLC(A) < HLC(B).
 * 3. Close to Physical Time: HLC stays within a bound of physical clock.
 *
 * Format: {physical_ms}:{logical_counter}
 */
export class HLC {
  private lastPhysical = 0;
  private lastCounter = 0;

  /**
   * Generates a new HLC timestamp for a local event.
   */
  public now(): string {
    const physical = Date.now();

    if (physical > this.lastPhysical) {
      this.lastPhysical = physical;
      this.lastCounter = 0;
    } else {
      // If time hasn't moved or moved backwards (due to clock skew), increment counter
      this.lastCounter++;
    }

    return `${this.lastPhysical}:${this.lastCounter.toString().padStart(5, '0')}`;
  }

  /**
   * Updates the local HLC based on a received remote timestamp.
   * Ensures the local clock catches up to the remote clock to preserve causality.
   */
  public update(remoteTimestamp: string): void {
    if (!remoteTimestamp || !remoteTimestamp.includes(':')) return;

    const parts = remoteTimestamp.split(':');
    if (parts.length < 2) return;

    const remotePhysical = parseInt(parts[0]!, 10);
    const remoteCounter = parseInt(parts[1]!, 10);
    const localPhysical = Date.now();

    const maxPhysical = Math.max(
      localPhysical,
      this.lastPhysical,
      remotePhysical,
    );

    if (maxPhysical === this.lastPhysical && maxPhysical === remotePhysical) {
      this.lastCounter = Math.max(this.lastCounter, remoteCounter) + 1;
    } else if (maxPhysical === this.lastPhysical) {
      this.lastCounter++;
    } else if (maxPhysical === remotePhysical) {
      this.lastCounter = remoteCounter + 1;
    } else {
      this.lastCounter = 0;
    }

    this.lastPhysical = maxPhysical;
  }

  /**
   * Compares two HLC timestamps.
   * Returns -1 if t1 < t2, 1 if t1 > t2, 0 if t1 == t2.
   */
  public static compare(t1: string, t2: string): number {
    return t1.localeCompare(t2);
  }
}
