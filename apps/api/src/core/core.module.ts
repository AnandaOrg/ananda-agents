import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { NotifyService } from './notify.service';
import { NumberingService } from './numbering.service';

@Global()
@Module({
  providers: [AuditService, MailService, NotifyService, NumberingService],
  exports: [AuditService, MailService, NotifyService, NumberingService],
})
export class CoreModule {}
