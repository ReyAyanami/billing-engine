import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('currencies')
@Index(['type'])
@Index(['isActive'])
export class Currency {
  @PrimaryColumn({ length: 10 })
  code!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 20 })
  type!: 'fiat' | 'non-fiat';

  @Column({ type: 'int', default: 2 })
  precision!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;
}
