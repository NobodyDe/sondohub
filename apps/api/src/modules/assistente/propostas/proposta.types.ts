import type {
  AssistentePropostaOperacao,
  AssistentePropostaResultado,
  AssistentePropostaResumo,
  UserRole,
} from '@sondohub/contracts';
import type { AcaoCliente } from '../acoes.js';

export const VALIDADE_PROPOSTA_MS = 2 * 60_000;
export const ADMIN_USERS_WRITER = 'ADMIN_USERS_WRITER';

export type AdminUsersWriter = {
  setAppLevel(id: string, slug: string, level: number): Promise<unknown>;
  removeApp(id: string, slug: string): Promise<unknown>;
  update(actorId: string, id: string, input: { role?: UserRole; isActive?: boolean }): Promise<unknown>;
};

export type PedidoPropostaEscrita = {
  operacao: string;
  /** Nome ou e-mail do usuário; se vazio ou pronome ("esse", "ela"), usa o usuário aberto na tela (`ver_tela`). */
  usuario?: string;
  /** Nome ou slug do aplicativo (para `liberar_app` e `remover_app`). */
  app?: string;
  /** Número ou nome do nível (para `liberar_app`), cargo (`alterar_cargo`) ou booleano (`autorizar_assistente`/`alterar_status`). */
  valor?: string;
};

export type ExecucaoProposta =
  | { tipo: 'liberar_app'; userId: string; slug: string; level: number }
  | { tipo: 'remover_app'; userId: string; slug: string }
  | { tipo: 'autorizar_assistente'; userId: string; autorizado: boolean }
  | { tipo: 'alterar_cargo'; userId: string; role: UserRole }
  | { tipo: 'alterar_status'; userId: string; isActive: boolean };

export type PropostaPendenteInterna = {
  id: string;
  autorId: string;
  expiraEmMs: number;
  resumo: AssistentePropostaResumo;
  execucao: ExecucaoProposta;
};

export type ResultadoCriacaoProposta = {
  texto: string;
  acao?: AcaoCliente;
};

export type { AssistentePropostaOperacao, AssistentePropostaResultado, AssistentePropostaResumo };
