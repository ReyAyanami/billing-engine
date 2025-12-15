import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
@Index(['correlationId'])
@Index(['timestamp'])
@Index(['operation'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'entity_type', length: 50 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId!: string;

  @Column({ length: 50 })
  operation!: string;

  @Column({ name: 'actor_id', length: 255, nullable: true })
  actorId!: string;

  @Column({ name: 'actor_type', length: 50, nullable: true })
  actorType!: string;

  @Column({ type: 'jsonb' })
  changes!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp!: Date;
}
