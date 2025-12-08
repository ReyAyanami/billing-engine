import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Kafka, Producer, Consumer, Admin, KafkaConfig } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

/**
 * Service for managing Kafka connections and operations.
 * Provides access to Kafka producer, consumers, and admin client.
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private consumers: Map<string, Consumer> = new Map();

  constructor(private configService: ConfigService) {
    const brokers = this.configService
      .get<string>(
        'KAFKA_BROKERS',
        'localhost:9092,localhost:9093,localhost:9094',
      )
      .split(',');

    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'billing-engine',
    );

    const kafkaConfig: KafkaConfig = {
      clientId,
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        multiplier: 2,
      },
      connectionTimeout: 10000,
      // Note: requestTimeout removed to prevent negative timeout calculations in KafkaJS
      // KafkaJS will use its default timeout (30000ms) which works better with retries
    };

    this.kafka = new Kafka(kafkaConfig);

    // Create producer with idempotence enabled for exactly-once semantics
    // Note: Message size limits are enforced at:
    // 1. Application layer: KafkaEventStore.validateMessageSize() (10 MB limit)
    // 2. Broker level: KAFKA_MESSAGE_MAX_BYTES (10 MB limit)
    // 3. Socket level: KAFKA_SOCKET_REQUEST_MAX_BYTES (100 MB for batching)
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 5,
      transactionalId: `${clientId}-producer`,
    });

    this.admin = this.kafka.admin();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('✅ Kafka producer connected');

      await this.admin.connect();
      this.logger.log('✅ Kafka admin connected');

      // List topics to verify connection
      const topics = await this.admin.listTopics();
      const billingTopics = topics.filter((t) => t.startsWith('billing.'));
      this.logger.log(
        `📋 Found ${billingTopics.length} billing topics: ${billingTopics.join(', ')}`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to connect to Kafka', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from Kafka...');

    try {
      await this.producer.disconnect();
      await this.admin.disconnect();

      for (const [groupId, consumer] of this.consumers) {
        await consumer.disconnect();
        this.logger.log(`Disconnected consumer group: ${groupId}`);
      }

      this.logger.log('✅ All Kafka connections closed');
    } catch (error) {
      this.logger.error('❌ Error disconnecting from Kafka', error);
    }
  }

  /**
   * Returns the Kafka producer for publishing events
   */
  getProducer(): Producer {
    return this.producer;
  }

  /**
   * Creates a new Kafka consumer for a specific consumer group.
   * Consumers are cached and reused if they already exist.
   *
   * @param groupId Consumer group ID
   * @returns Kafka consumer instance
   */
  async createConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxInFlightRequests: 5,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    await consumer.connect();
    this.consumers.set(groupId, consumer);

    this.logger.log(`✅ Consumer created for group: ${groupId}`);

    return consumer;
  }

  /**
   * Returns the Kafka admin client for administrative operations
   */
  getAdmin(): Admin {
    return this.admin;
  }

  /**
   * Checks if the Kafka connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.admin.listTopics();
      return true;
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }
}
