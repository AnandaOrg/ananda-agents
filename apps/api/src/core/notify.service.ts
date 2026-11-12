import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@ananda-agents/shared';
import { InjectDb, type Db, type DbOrTx } from '../db/db.module';
import { notifications } from '../db/schema';

/** In-app notifications. Text is rendered by the web app from type + params, in the agent's language. */
@Injectable()
export class NotifyService {
  constructor(@InjectDb() private readonly db: Db) {}

  async notify(userId: string, type: NotificationType, params: Record<string, string>, link: string, tx?: DbOrTx) {
    await (tx ?? this.db).insert(notifications).values({ userId, type, params, link });
  }
}
