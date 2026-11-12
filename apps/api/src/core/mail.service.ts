import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string | string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** SMTP (Mailpit locally). Bounce tracking needs the chosen provider's webhook (PRD: to choose). */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private transport: Transporter | null = null;

  private get transporter(): Transporter {
    this.transport ??= nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1027),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    return this.transport;
  }

  async send(mail: Mail): Promise<void> {
    await this.transporter.sendMail({ from: process.env.MAIL_FROM ?? 'ANANDA <sales@ananda.test>', ...mail });
    this.log.log(`Sent "${mail.subject}" to ${[mail.to].flat().join(', ')}`);
  }
}
