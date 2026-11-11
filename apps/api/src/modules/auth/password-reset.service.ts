import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  ResetPasswordInput,
  VerifyResetCodeInput,
} from '@sondohub/contracts';
import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersRepository } from '../users/users.repository.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5; // 6 dígitos = 1 milhão de combinações: sem limite, dá para chutar todas.

/** randomInt usa o gerador criptográfico do Node: o código não é previsível. */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
  ) {}

  /** Gera e envia o código. Não avisa se o e-mail não existe: quem chama recebe sempre 204. */
  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user?.isActive) return;

    const code = generateCode();
    const data = {
      codeHash: await argon2.hash(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    };
    // Um código por usuário: pedir de novo troca o anterior.
    await this.prisma.passwordResetCode.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    // Sem await: se o SMTP falhar ou demorar, a resposta continua igual à de um e-mail inexistente.
    this.mail
      .sendPasswordResetCode(user.email, code)
      .catch((err) => this.logger.error('Falha ao enviar o código', err));
  }

  /** Confere o código e devolve o id do usuário. Todo erro tem a mesma mensagem, de propósito. */
  async verify({ email, code }: VerifyResetCodeInput): Promise<string> {
    const invalid = new BadRequestException('Código inválido ou expirado.');

    const user = await this.users.findByEmail(email);
    if (!user?.isActive) throw invalid;

    const reset = await this.prisma.passwordResetCode.findUnique({
      where: { userId: user.id },
    });
    if (
      !reset ||
      reset.expiresAt <= new Date() ||
      reset.attempts >= MAX_ATTEMPTS
    )
      throw invalid;

    if (!(await argon2.verify(reset.codeHash, code))) {
      await this.prisma.passwordResetCode.update({
        where: { userId: user.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid;
    }
    return user.id;
  }

  /** Confere o código de novo, grava a senha, derruba as sessões e queima o código. */
  async confirm({ email, code, password }: ResetPasswordInput): Promise<void> {
    const userId = await this.verify({ email, code });
    await this.users.setPassword(userId, await argon2.hash(password));
    await this.sessions.revokeAll(userId);
    await this.prisma.passwordResetCode.delete({ where: { userId } });
  }
}
