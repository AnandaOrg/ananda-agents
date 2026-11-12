import { Injectable } from '@nestjs/common';
import { InjectDb, type Db, type DbOrTx } from '../db/db.module';
import { auditLog } from '../db/schema';

export type AuditAction =
  | 'login'
  | 'customer.create'
  | 'customer.approve'
  | 'customer.reject'
  | 'customer.claim'
  | 'customer.take_over_request'
  | 'customer.take_over_approve'
  | 'customer.take_over_decline'
  | 'price.request'
  | 'price.approve'
  | 'price.decline'
  | 'proforma.send'
  | 'reminder.send'
  | 'correction.request'
  | 'correction.resolve'
  | 'order.status'
  | 'payment_details.update'
  | 'payment_details.view';

/** Immutable trail of who did what, when (PRD NFR Audit). */
@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Db) {}

  async log(actorId: string | null, action: AuditAction, entity: string, entityId: string | null, data: Record<string, unknown> = {}, tx?: DbOrTx) {
    await (tx ?? this.db).insert(auditLog).values({ actorId, action, entity, entityId, data });
  }
}
