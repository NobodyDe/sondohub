import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { env } from '../../config/env.js';

/** Slug do Experience na tabela applications. */
export const EXPERIENCE_SLUG = 'experience';

const TIMEOUT_MS = 5_000; // sem limite, um Experience travado prenderia a tela do painel junto.

/**
 * Nível do app experience (applications.levels) → coluna adm do Experience.
 * Aqui o número NÃO cresce com a permissão: o nível é o próprio valor do adm de lá (1 = admin, 2 = usuário).
 */
const ADM_BY_LEVEL: Record<number, 1 | 2 | undefined> = { 1: 1, 2: 2 };

type ExperienceUser = { name: string; email: string };

/**
 * O Experience guarda uma cópia do usuário (app_experience.usuarios, ligado pelo hub_user_id).
 * Nome, e-mail e foto se renovam sozinhos a cada login pelo hub; daqui só sai quem entra, com qual nível, e quem sai.
 */
@Injectable()
export class ExperienceClient {
  private readonly logger = new Logger(ExperienceClient.name);

  /** O PUT de lá é upsert: cria o usuário (ou liga um que já existia pelo e-mail) ou troca o adm, e reativa. */
  async upsertUser(
    id: string,
    user: ExperienceUser,
    level: number,
  ): Promise<void> {
    const adm = ADM_BY_LEVEL[level];
    // O painel de apps deixa criar um 3º nível; sem adm equivalente, o Experience recusaria com 400.
    if (!adm)
      throw new BadRequestException('Esse nível não existe no Experience.');

    if (
      !(await this.send('PUT', id, { name: user.name, email: user.email, adm }))
    )
      throw new BadGatewayException(
        'O Experience não respondeu. Nada foi salvo; tente de novo.',
      );
  }

  /**
   * Não lança: quem chama já revogou o acesso no hub, e sem token do hub não há login pelo hub.
   * Lá o usuário só fica inativo (status_ativo = 0), o que também barra a senha própria, se ele tiver uma.
   */
  async deactivateUser(id: string): Promise<void> {
    await this.send('DELETE', id);
  }

  /** Devolve se deu certo. O motivo da falha fica só no log (401 = chave errada, timeout = Experience fora do ar). */
  private async send(
    method: 'PUT' | 'DELETE',
    id: string,
    body?: object,
  ): Promise<boolean> {
    const url = `${env.EXPERIENCE_API_URL}/sondohub/users/${id}`;
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.EXPERIENCE_API_KEY,
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      return true;
    } catch (error) {
      this.logger.error(`${method} ${url} falhou`, error);
      return false;
    }
  }
}
