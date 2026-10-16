import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { safeUserSelect } from '../users/users.repository.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, contados do login
const TOKEN_BYTES = 32;

export type SessionMeta = { userAgent?: string; ip?: string };

// O banco guarda só o hash: se vazar, ninguém consegue usar as sessões.
// SHA-256 (rápido) basta porque o token tem 256 bits aleatórios: não há o que adivinhar.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, meta: SessionMeta): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }

  async validate(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: safeUserSelect },
      },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    )
      return null;

    return { sessionId: session.id, user: session.user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
