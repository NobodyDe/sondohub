import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminUserDetail,
  AppLevel,
  CreateUserInput,
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

  async create({ apps, ...data }: CreateUserInput): Promise<AdminUserDetail> {
    if (await this.users.existsByEmail(data.email))
      throw new ConflictException('Já existe um usuário com esse e-mail.');

    const access = await this.resolveAccess(apps);
    const id = await this.users.create(data, access);
    return this.getDetail(id);
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
    assertLevelExists(app.levels as AppLevel[], level);

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

  /** Troca o slug pelo id do app, conferindo se o app existe e se tem o nível pedido. */
  private resolveAccess(apps: CreateUserInput['apps']) {
    return Promise.all(
      apps.map(async ({ slug, level }) => {
        const app = await this.findApp(slug);
        assertLevelExists(app.levels as AppLevel[], level);
        return { applicationId: app.id, level };
      }),
    );
  }
}

/** O nível precisa ser um dos que o app oferece (coluna applications.levels). */
function assertLevelExists(levels: AppLevel[], level: number) {
  if (!levels.some((option) => option.level === level))
    throw new BadRequestException('Este app não tem esse nível.');
}

/** O Master não mexe no próprio cargo, status nem conta por aqui: evita se trancar fora do painel. */
function assertNotSelf(actorId: string, id: string) {
  if (actorId === id)
    throw new ForbiddenException(
      'Você não pode alterar a própria conta por aqui.',
    );
}
