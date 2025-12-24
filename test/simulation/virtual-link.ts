import { Logger } from '@nestjs/common';

/**
 * Simulates a network link between two regions.
 * Allows injecting latency, dropping packets (partitions), and reordering.
 */
export class VirtualLink {
  private readonly logger = new Logger(VirtualLink.name);
  private isPartitioned = false;
  private latencyMs = 0;
  private dropRate = 0; // 0 to 1

  constructor(
    public readonly sourceRegion: string,
    public readonly targetRegion: string,
  ) {}

  sever() {
    this.isPartitioned = true;
    this.logger.warn(
      `LINK SEVERED: ${this.sourceRegion} <-> ${this.targetRegion}`,
    );
  }

  heal() {
    this.isPartitioned = false;
    this.logger.log(
      `LINK HEALED: ${this.sourceRegion} <-> ${this.targetRegion}`,
    );
  }

  setLatency(ms: number) {
    this.latencyMs = ms;
  }

  setDropRate(rate: number) {
    this.dropRate = rate;
  }

  async pipe<T>(
    message: T,
    deliveryFn: (msg: T) => Promise<void>,
  ): Promise<void> {
    if (this.isPartitioned) {
      this.logger.debug(
        `Link ${this.sourceRegion}->${this.targetRegion} is partitioned. Message dropped.`,
      );
      return;
    }

    if (Math.random() < this.dropRate) {
      this.logger.debug(
        `Link ${this.sourceRegion}->${this.targetRegion} dropped message due to dropRate.`,
      );
      return;
    }

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    await deliveryFn(message);
  }
}
