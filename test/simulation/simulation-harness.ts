import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { VirtualLink } from './virtual-link';
import { Logger } from '@nestjs/common';

/**
 * Harness to run multiple logical regions in a single process for deterministic testing.
 */
export class SimulationHarness {
    private readonly logger = new Logger(SimulationHarness.name);
    private regions: Map<string, TestingModule> = new Map();
    private links: Map<string, VirtualLink> = new Map();

    async createRegion(regionId: string) {
        this.logger.log(`Creating virtual region: ${regionId}`);

        // In a real simulation, we'd override providers to use in-memory DBs per region
        // and mock Kafka for the VirtualLink.
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider('REGION_ID').useValue(regionId)
            // We'd add more overrides here for isolation
            .compile();

        this.regions.set(regionId, moduleFixture);
        return moduleFixture;
    }

    addLink(source: string, target: string): VirtualLink {
        const link = new VirtualLink(source, target);
        this.links.set(`${source}-${target}`, link);
        return link;
    }

    async runScenario() {
        // This is where specific test logic (like the Partition & Heal scenario) would live
    }
}
