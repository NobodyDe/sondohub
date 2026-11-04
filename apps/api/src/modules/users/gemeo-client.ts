import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '@sondohub/contracts';
import { env } from '../../config/env.js';

/** Slug do Gêmeo Digital na tabela applications. */
export const GEMEO_SLUG = 'gemeo';

const GEMEO_USERS_URL = 'https://gds-techlab.sondotecnica.com/users';
const TIMEOUT_MS = 5_000; // sem limite, um Gêmeo travado prenderia a tela do painel junto.

/** O Gêmeo guarda os usuários do hub numa tabela própria (usuarios_sondohub) para ligá-los a contratos. */
@Injectable()
export class GemeoClient {
  private readonly logger = new Logger(GemeoClient.name);

  /** O PUT do Gêmeo é upsert: cria o usuário ou troca o role. Chamar duas vezes dá o mesmo resultado. */
  async upsertUser(id: string, role: UserRole): Promise<void> {
    if (!(await this.send('PUT', id, { role })))
      throw new BadGatewayException(
        'O Gêmeo Digital não respondeu. Nada foi salvo; tente de novo.',
      );
  }

  /**
   * Não lança: quem chama já revogou o acesso no hub, e uma linha que sobra no Gêmeo
   * não deixa ninguém entrar (sem token do hub não há login). O Gêmeo apaga os vínculos com contratos junto.
   */
  async deleteUser(id: string): Promise<void> {
    await this.send('DELETE', id);
  }

  /** Devolve se deu certo. O motivo da falha fica só no log (401 = chave errada, timeout = Gêmeo fora do ar). */
  private async send(
    method: 'PUT' | 'DELETE',
    id: string,
    body?: object,
  ): Promise<boolean> {
    try {
      const response = await fetch(`${GEMEO_USERS_URL}/${id}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.GDS_APY_KEY,
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      return true;
    } catch (error) {
      this.logger.error(`${method} /users/${id} falhou`, error);
      return false;
    }
  }
}
