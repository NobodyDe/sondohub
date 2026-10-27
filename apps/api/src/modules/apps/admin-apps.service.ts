import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AdminApp,
  type CreateAppInput,
  defaultIconUrl,
  type UpdateAppInput,
} from '@sondohub/contracts';
import { AppsRepository } from './apps.repository.js';

@Injectable()
export class AdminAppsService {
  constructor(private readonly apps: AppsRepository) {}

  async getDetail(id: string): Promise<AdminApp> {
    const app = await this.apps.findAdminDetail(id);
    if (!app) throw new NotFoundException('Aplicativo não encontrado.');
    return app;
  }

  async create(input: CreateAppInput): Promise<AdminApp> {
    const data = withDerivedFields(input);
    if (await this.apps.findBySlug(data.slug))
      throw conflict('slug', 'Já existe um aplicativo com esse identificador.');
    await this.assertOriginFree(data.origin);

    const id = await this.apps.create(data);
    return this.getDetail(id);
  }

  async update(id: string, input: UpdateAppInput): Promise<AdminApp> {
    await this.getDetail(id); // 404 claro, em vez do erro do Prisma ao atualizar quem não existe.
    const data = withDerivedFields(input);
    await this.assertOriginFree(data.origin, id);
    await this.assertLevelsCoverUsers(id, data.levels.length);

    await this.apps.update(id, data);
    return this.getDetail(id);
  }

  /** A origem identifica o app no SSO: com dois apps nela, o hub não saberia de qual é o token. */
  private async assertOriginFree(origin: string, appId?: string) {
    const ownerId = await this.apps.findIdByOrigin(origin);
    if (ownerId && ownerId !== appId)
      throw conflict('url', 'Já existe um aplicativo nesse endereço.');
  }

  /** Tirar um nível que alguém usa deixaria essa pessoa com um nível que o app não tem. */
  private async assertLevelsCoverUsers(appId: string, levelCount: number) {
    const highest = await this.apps.highestLevelInUse(appId);
    if (highest > levelCount)
      throw conflict(
        'levels',
        `Há pessoas no nível ${highest}. Mude o nível delas antes de remover.`,
      );
  }
}

/** Origem e ícone padrão saem da URL: a tela não precisa (nem deve) mandar. */
function withDerivedFields<T extends UpdateAppInput>(input: T) {
  return {
    ...input,
    iconUrl: input.iconUrl || defaultIconUrl(input.url),
    origin: new URL(input.url).origin,
  };
}

/** 409 dizendo qual campo bateu: a tela mostra a mensagem embaixo dele. */
function conflict(field: string, message: string) {
  return new ConflictException({ field, message });
}
