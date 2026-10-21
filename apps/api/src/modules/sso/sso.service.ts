import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SondoUser, TokenResponse } from '@sondohub/contracts';
import { AppsRepository } from '../apps/apps.repository.js';
import type { SafeUser } from '../users/users.repository.js';
import { ACCESS_TOKEN_TTL_SECONDS, TokenService } from './token.service.js';

@Injectable()
export class SsoService {
  constructor(
    private readonly apps: AppsRepository,
    private readonly tokens: TokenService,
  ) {}

  /** O app é descoberto pelo Origin da requisição, nunca por um parâmetro que o cliente escolhe. */
  async issueToken(
    user: SafeUser,
    origin: string | undefined,
  ): Promise<TokenResponse> {
    const app = origin ? await this.apps.findActiveByOrigin(origin) : null;
    if (!app) throw new ForbiddenException('App não cadastrado');

    const access = await this.apps.findAccessLevel(user.id, app.id);
    if (!access) throw new ForbiddenException('Sem acesso a este app');

    const sondoUser: SondoUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.avatarUrl,
      level: access.level,
    };
    return {
      accessToken: await this.tokens.sign(app.slug, sondoUser),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: sondoUser,
    };
  }
}
