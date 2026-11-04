import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { env } from '../../config/env.js';

/** Slug do Gêmeo Digital na tabela applications. */
export const GEMEO_SLUG = 'gemeo';

// Não é /users: no nginx da VM, /users é do ChirpStack, que responde 200 com HTML para qualquer método.
const GEMEO_USERS_URL = 'https://gds-techlab.sondotecnica.com/sondohub/users';
const TIMEOUT_MS = 5_000; // sem limite, um Gêmeo travado prenderia a tela do painel junto.

/** Os papéis que a rota do Gêmeo aceita. Têm o mesmo nome do cargo do hub, mas são do Gêmeo. */
type GemeoRole = 'USER' | 'ADMIN' | 'MASTER';

/** Nível do app gemeo (applications.levels) → role do Gêmeo. Número maior = mais permissão, dos dois lados. */
const ROLE_BY_LEVEL: Record<number, GemeoRole | undefined> = {
  1: 'USER',
  2: 'ADMIN',
  3: 'MASTER',
};

/** O Gêmeo guarda os usuários do hub numa tabela própria (usuarios_sondohub) para ligá-los a contratos. */
@Injectable()
export class GemeoClient {
  private readonly logger = new Logger(GemeoClient.name);

  /** Traduz o nível do hub para o role do Gêmeo. O PUT dele é upsert: cria o usuário ou troca o role. */
  async upsertUser(id: string, level: number): Promise<void> {
    const role = ROLE_BY_LEVEL[level];
    // O painel de apps deixa criar um 4º nível; sem papel equivalente, o Gêmeo recusaria com 400.
    if (!role)
      throw new BadRequestException('Esse nível não existe no Gêmeo Digital.');

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
    const url = `${GEMEO_USERS_URL}/${id}`;
    try {
      const response = await fetch(url, {
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
      this.logger.error(`${method} ${url} falhou`, error);
      return false;
    }
  }
}
