import type { SafeUser } from '../../users/users.repository.js';

export const TIMEOUT_FEDERACAO_MS = 6_000;

export type PedidoConsultaAppFilho = {
  /** Nome ou slug do aplicativo filho (ex.: "sondoview", "gemeo", "experience"). */
  app: string;
  /** Pergunta ou comando de consulta para o aplicativo filho responder no escopo do usuário. */
  consulta: string;
};

export type PayloadFederado = {
  hubUserId: string;
  email: string;
  name: string;
  level: number;
  levelLabel?: string;
  query: string;
};

export type RespostaHttpAppFilho = {
  ok?: boolean;
  texto?: string;
  text?: string;
};

export type ContextoUsuarioFederado = Pick<SafeUser, 'id' | 'name' | 'email' | 'role'>;
