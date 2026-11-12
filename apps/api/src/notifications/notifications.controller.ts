import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NotificationsList, NotificationType } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { notifications } from '../db/schema';
import { CurrentUser, type AuthUser } from '../core/context';

@Controller('notifications')
export class NotificationsController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<NotificationsList> {
    const items = await this.db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(30);
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return {
      unread: n,
      items: items.map((i) => ({ id: i.id, type: i.type as NotificationType, params: i.params, link: i.link, read: !!i.readAt, createdAt: i.createdAt.toISOString() })),
    };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  }
}
