import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminUserDetail,
  AppLevel,
  UpdateUserInput,
} from '@sondohub/contracts';
import { AppsRepository } from '../apps/apps.repository.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly apps: AppsRepository,
  ) {}

  async getDetail(id: string): Promise<AdminUserDetail> {
    const user = await this.users.findDetail(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateUserInput,
  ): Promise<AdminUserDetail> {
    assertNotSelf(actorId, id);
    await this.getDetail(id); // 404 claro, em vez do erro do Prisma ao atualizar quem não existe.
    await this.users.update(id, input);
    return this.getDetail(id);
  }

  async setAppLevel(
    id: string,
    slug: string,
    level: number,
  ): Promise<AdminUserDetail> {
    await this.getDetail(id); // sem isso, um id inexistente estoura a chave estrangeira (500).
    const app = await this.findApp(slug);
    const levels = app.levels as AppLevel[];
    if (!levels.some((option) => option.level === level))
      throw new BadRequestException('Este app não tem esse nível.');

    await this.users.upsertAccess(id, app.id, level);
    return this.getDetail(id);
  }

  async removeApp(id: string, slug: string): Promise<AdminUserDetail> {
    const app = await this.findApp(slug);
    await this.users.deleteAccess(id, app.id);
    return this.getDetail(id); // aqui o 404 do usuário sai de graça.
  }

  async remove(actorId: string, id: string): Promise<void> {
    assertNotSelf(actorId, id);
    await this.getDetail(id);
    await this.users.delete(id);
  }

  private async findApp(slug: string) {
    const app = await this.apps.findBySlug(slug);
    if (!app) throw new NotFoundException('App não encontrado.');
    return app;
  }
}

/** O Master não mexe no próprio cargo, status nem conta por aqui: evita se trancar fora do painel. */
function assertNotSelf(actorId: string, id: string) {
  if (actorId === id)
    throw new ForbiddenException(
      'Você não pode alterar a própria conta por aqui.',
    );
}
