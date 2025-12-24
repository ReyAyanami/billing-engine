import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TimerStatus {
  PENDING = 'pending',
  TRIGGERED = 'triggered',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Entity('workflow_timers')
export class WorkflowTimer {
  @PrimaryColumn({ length: 36 })
  timerId!: string;

  @Column({ length: 36 })
  @Index()
  sagaId!: string;

  @Column()
  @Index()
  executeAt!: Date;

  @Column('jsonb')
  payload!: any;

  @Column({
    type: 'enum',
    enum: TimerStatus,
    default: TimerStatus.PENDING,
  })
  status!: TimerStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
