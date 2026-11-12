import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { FreeRemindersJob } from './free-reminders.job';
import { CronController } from './cron.controller';

@Module({ controllers: [NotificationsController, CronController], providers: [FreeRemindersJob] })
export class NotificationsModule {}
