import { Injectable, Logger } from '@nestjs/common';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { env } from '../../config/env.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { AssistenteExecutor } from './executor.js';
import { AssistenteRepository } from './assistente.repository.js';
import { atenderVoz } from './sessao-voz.js';
import { lerCookie, origemPermitida } from './upgrade.js';

export const CAMINHO_VOZ = '/api/assistente/voz';
const MAX_PAYLOAD = 256 * 1024;
/** Cada sessão abre uma conexão paga no Gemini: limita quantas um mesmo usuário mantém ao mesmo tempo. */
export const MAX_SESSOES_POR_USUARIO = 3;

function recusar(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

@Injectable()
export class AssistenteGateway {
  private readonly logger = new Logger('AssistenteGateway');
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  private readonly sessoes = new Map<string, number>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly repo: AssistenteRepository,
    private readonly executor: AssistenteExecutor,
  ) {}

  /** Liga o WebSocket ao `upgrade` do servidor HTTP (o Nest só cuida de HTTP comum). Chamado em main.ts. */
  attach(server: Server): void {
    server.on('upgrade', (req, socket, head) => {
      void this.aoAtualizar(req, socket, head).catch((error: Error) => {
        this.logger.error(`upgrade falhou: ${error.message}`);
        recusar(socket, '500 Internal Server Error');
      });
    });
  }

  private async aoAtualizar(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const caminho = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (caminho !== CAMINHO_VOZ) return void socket.destroy();
    if (!origemPermitida(req.headers.origin, env.HUB_URL)) return recusar(socket, '403 Forbidden');

    const auth = await this.sessions.validate(lerCookie(req.headers.cookie, env.SESSION_COOKIE_NAME));
    if (!auth) return recusar(socket, '401 Unauthorized');
    if ((this.sessoes.get(auth.user.id) ?? 0) >= MAX_SESSOES_POR_USUARIO) return recusar(socket, '429 Too Many Requests');

    this.wss.handleUpgrade(req, socket, head, (ws) => this.abrir(ws, auth));
  }

  private abrir(ws: Parameters<typeof atenderVoz>[0], auth: AuthContext): void {
    const id = auth.user.id;
    this.sessoes.set(id, (this.sessoes.get(id) ?? 0) + 1);
    atenderVoz(ws, auth, { repo: this.repo, executor: this.executor }, () => {
      const restantes = (this.sessoes.get(id) ?? 1) - 1;
      if (restantes <= 0) this.sessoes.delete(id);
      else this.sessoes.set(id, restantes);
    });
  }
}
