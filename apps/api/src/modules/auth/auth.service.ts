import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@sondohub/contracts';
import argon2 from 'argon2';
import {
  SessionsService,
  type SessionMeta,
} from '../sessions/sessions.service.js';
import { UsersRepository, type SafeUser } from '../users/users.repository.js';

export type LoginResult = { token: string; user: SafeUser };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
  ) {}

  /** Confere email e senha, cria a sessão e devolve o token dela junto com o usuário. */
  async login(
    { email, password }: LoginInput,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const user = await this.users.findForLogin(email);
    if (
      !user?.passwordHash ||
      !user.isActive ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Tira do objeto os campos que só o login usa: o resto é o SafeUser.
    const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user;
    return { token: await this.sessions.create(user.id, meta), user: safeUser };
  }
}
