import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

/**
 * Email, over SMTP.
 *
 * Pointed at Mailpit in local development (`:58025`, per the plan's port
 * map), which accepts everything and shows it in a web UI — so the email
 * path is exercised on every demo rather than only in production. An
 * unconfigured transport logs the message instead of sending it, which keeps
 * a developer without Mailpit running from seeing a failed delivery on every
 * settlement.
 */
@Injectable()
export class EmailTransport {
  private readonly logger = new Logger(EmailTransport.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST', { infer: true }) ?? '';
    this.from = config.get<string>('SMTP_FROM', { infer: true }) ?? 'DAMP <no-reply@damp.local>';

    if (!host) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST is unset; emails will be logged rather than sent');
      return;
    }

    this.transporter = createTransport({
      host,
      port: config.get<number>('SMTP_PORT', { infer: true }) ?? 1025,
      // Mailpit speaks plaintext SMTP on 1025 and has no credentials. A real
      // provider sets SMTP_SECURE and the auth pair.
      secure: config.get<boolean>('SMTP_SECURE', { infer: true }) ?? false,
      auth: config.get<string>('SMTP_USER', { infer: true })
        ? {
            user: config.get<string>('SMTP_USER', { infer: true }),
            pass: config.get<string>('SMTP_PASSWORD', { infer: true }),
          }
        : undefined,
    });
  }

  /** Returns 1 if a message was accepted for delivery, 0 if it was only logged. */
  async send(message: { to: string; subject: string; body: string }): Promise<number> {
    if (!this.transporter) {
      this.logger.log(`[email not sent: no SMTP_HOST] to=${message.to} subject=${message.subject}`);
      return 0;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return 1;
  }
}
