import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

@Injectable()
export class MailService {
  // Porta 587: a conexão começa aberta e sobe para TLS (STARTTLS). requireTLS recusa enviar sem ele.
  private readonly transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Código para redefinir sua senha do SondoHub',
      text: [
        `Seu código é ${code}.`,
        'Ele vale por 5 minutos e só pode ser usado uma vez.',
        'Se você não pediu a troca de senha, ignore este e-mail.',
      ].join('\n'),
    });
  }
}
