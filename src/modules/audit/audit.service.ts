import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { OperationContext } from '../../common/types';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    entityType: string,
    entityId: string,
    operation: string,
    changes: Record<string, any>,
    context: OperationContext,
  ): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      entityType,
      entityId,
      operation,
      actorId: context.actorId,
      actorType: context.actorType,
      changes,
      correlationId: context.correlationId,
    });

    return await this.auditLogRepository.save(auditLog);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { entityType, entityId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async findByCorrelationId(correlationId: string): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { correlationId },
      order: { timestamp: 'ASC' },
    });
  }

  async findByOperation(
    operation: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { operation },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }
}

