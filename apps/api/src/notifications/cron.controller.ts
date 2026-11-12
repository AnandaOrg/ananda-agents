import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../core/context';
import { FreeRemindersJob } from './free-reminders.job';

/** Vercel Cron entry points (vercel.json `crons`). Vercel sends `Authorization: Bearer $CRON_SECRET`;
 * without CRON_SECRET set, every call is refused. */
@Public()
@Controller('cron')
export class CronController {
  constructor(@Inject(FreeRemindersJob) private readonly freeReminders: FreeRemindersJob) {}

  @Get('free-reminders')
  run(@Headers('authorization') auth: string | undefined) {
    const secret = process.env.CRON_SECRET;
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(auth ?? '');
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
    return this.freeReminders.run();
  }
}
