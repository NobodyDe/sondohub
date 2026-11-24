// Formato (JSON) das respostas de /api/assistente. Só tipos: a validação do que entra fica na API.

export const ASSISTENTE_VOZES = ["Charon", "Kore"] as const;
export type AssistenteVoz = (typeof ASSISTENTE_VOZES)[number];
export type AssistenteModoMic = "aberto" | "apertar";
export type AssistentePreferencia = "voz" | "texto";

export type AssistenteConfigResposta = {
  /** O Master liberou o uso para este usuário (o próprio Master sempre está liberado). */
  autorizado: boolean;
  /** Efetivo: autorizado, ligado e com alguma chave (própria ou global). */
  habilitado: boolean;
  /** O valor salvo do interruptor "ligar", antes de olhar autorização e chave. */
  habilitadoConfig: boolean;
  chavePropriaConfigurada: boolean;
  chaveConfigurada: boolean;
  voz: AssistenteVoz;
  vozes: readonly AssistenteVoz[];
  internet: boolean;
  /** Vazio = o assistente pergunta como a pessoa quer chamá-lo. */
  nome: string;
  /** Vazio = primeiro nome do cadastro. */
  apelido: string;
  modoMic: AssistenteModoMic;
  chatTexto: boolean;
  preferencia: AssistentePreferencia;
  /** É Master: vê a chave global, as regras da empresa e a auditoria. */
  podeEditar: boolean;
};

export type AssistenteRegra = { id: string; nome: string; texto: string; ativo: boolean; bloqueia: string[] };
export type AssistenteMemoria = { id: string; texto: string; origem: "usuario" | "assistente"; ativo: boolean };
export type AssistentePergunta = { id: string; texto: string; ativo: boolean };

export type AssistenteAuditoriaRegistro = {
  id: string;
  usuarioNome: string;
  ferramenta: string;
  argumentos: string | null;
  resultado: string | null;
  bloqueada: boolean;
  createdAt: string;
};

export type AssistenteChaveValidacao = { valida: boolean; mensagem: string };
export type AssistentePermissao = { autorizado: boolean };
