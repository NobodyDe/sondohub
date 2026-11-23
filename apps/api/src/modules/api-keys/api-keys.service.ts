import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CreateApiKeyInput } from '@sondohub/contracts';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashToken } from '../sessions/sessions.service.js';
import type { SafeUser } from '../users/users.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Prefixo fixo: identifica a chave num log e deixa scanners de segredo (ex.: GitHub) acharem vazamentos.
const SECRET_PREFIX = 'sk_sondo_';

/** O que sai para a tela. Nunca o key_hash. */
const apiKeySelect = {
  id: true,
  name: true,
  hint: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
} as const;

/**
 * Chaves de API do próprio usuário. Mesmo esquema das sessões: o segredo é aleatório (256 bits),
 * vai para a pessoa uma vez só e o banco guarda apenas o SHA-256. Se o banco vazar, as chaves não vazam.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Só as que ainda valem para a pessoa: revogada some da lista; vencida aparece (a tela marca). */
  listOwn(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      select: apiKeySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: Pick<SafeUser, 'id' | 'role'>, input: CreateApiKeyInput) {
    // Chave eterna é para apps internos; a tela esconde a opção, mas quem barra é aqui.
    if (input.expiresInDays === null && user.role !== 'MASTER')
      throw new ForbiddenException('Só o Master pode criar chave sem validade.');

    const secret = SECRET_PREFIX + randomBytes(32).toString('base64url');
    const key = await this.prisma.apiKey.create({
      data: {
        userId: user.id,
        name: input.name,
        keyHash: hashToken(secret),
        hint: `${secret.slice(0, 12)}...${secret.slice(-4)}`,
        expiresAt: input.expiresInDays === null ? null : new Date(Date.now() + input.expiresInDays * DAY_MS),
      },
      select: apiKeySelect,
    });
    return { key, secret };
  }

  /** O userId no filtro impede revogar a chave de outra pessoa trocando o id na URL. */
  async revokeOwn(userId: string, id: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
