import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { FreeRemindersJob } from './free-reminders.job';

@Module({ controllers: [NotificationsController], providers: [FreeRemindersJob] })
export class NotificationsModule {}
