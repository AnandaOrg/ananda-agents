import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { isoDate, ownershipState } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { customers, freeReminders } from '../db/schema';
import { NotifyService } from '../core/notify.service';

/** "Remind me when it's free" (UC-04): on the free-from date, tell the agent the customer can be claimed. */
@Injectable()
export class FreeRemindersJob implements OnApplicationBootstrap {
  private readonly log = new Logger('FreeReminders');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notify: NotifyService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.SEEDING !== '1') void this.run();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    const due = await this.db
      .select({ r: freeReminders, c: customers })
      .from(freeReminders)
      .innerJoin(customers, eq(customers.id, freeReminders.customerId))
      .where(and(isNull(freeReminders.sentAt), lte(freeReminders.notifyOn, isoDate(new Date()))));
    for (const { r, c } of due) {
      // The owner may have sold again since; then wait for the new free-from date.
      if (ownershipState(r.agentId, c) === 'free') {
        await this.notify.notify(r.agentId, 'customer_free', { customer: c.name, vat: c.vatNumber }, `/customers?q=${encodeURIComponent(c.vatNumber)}`);
        await this.db.update(freeReminders).set({ sentAt: new Date() }).where(eq(freeReminders.id, r.id));
      }
    }
    if (due.length) this.log.log(`Checked ${due.length} free-from reminders`);
  }
}
