import type {
  AssistenteAuditoriaRegistro,
  AssistenteChaveValidacao,
  AssistenteConfigResposta,
  AssistenteMemoria,
  AssistentePergunta,
  AssistentePermissao,
  AssistenteRegra,
} from "@sondohub/contracts";
import { request } from "../../lib/api.ts";

/** Campos que o usuário muda nas próprias preferências (PUT /assistente/preferencias). */
export type AssistenteAlteracao = Partial<
  Pick<
    AssistenteConfigResposta,
    "voz" | "internet" | "nome" | "apelido" | "modoMic" | "chatTexto" | "preferencia"
  > & { habilitado: boolean }
>;
export type AssistenteEntradaRegra = Partial<Pick<AssistenteRegra, "nome" | "texto" | "ativo" | "bloqueia">>;
export type AssistenteEntradaTexto = { texto?: string; ativo?: boolean };

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const base = "/assistente";
const baseRegras = (global?: boolean) => `${base}/${global ? "regras-globais" : "regras"}`;

/** Cliente HTTP do assistente. Rotas e formatos: apps/api/src/modules/assistente/assistente.controller.ts. */
export const assistenteApi = {
  config: () => request<AssistenteConfigResposta>(`${base}/config`),
  salvarPreferencias: (a: AssistenteAlteracao) =>
    request<AssistenteConfigResposta>(`${base}/preferencias`, json("PUT", a)),

  /** Chave da empresa (só Master): ler para copiar, salvar e validar. */
  chaveGlobal: async () => (await request<{ chave: string }>(`${base}/config/chave`)).chave,
  salvarChaveGlobal: (apiKey: string) => request<AssistenteConfigResposta>(`${base}/config`, json("PUT", { apiKey })),
  /** Chave própria (de cada pessoa). `''` remove. */
  chavePropria: async () => (await request<{ chave: string }>(`${base}/chave-propria`)).chave,
  salvarChavePropria: (apiKey: string) =>
    request<AssistenteConfigResposta>(`${base}/chave-propria`, json("PUT", { apiKey })),
  /** Sem `apiKey`, valida a que está salva. */
  validarChave: (escopo: "global" | "propria", apiKey?: string) =>
    request<AssistenteChaveValidacao>(`${base}/validar-chave`, json("POST", { escopo, apiKey })),

  /** `global`: regras da empresa (só Master), valem para todos. */
  regras: async (global?: boolean) => (await request<{ regras: AssistenteRegra[] }>(baseRegras(global))).regras,
  criarRegra: (e: AssistenteEntradaRegra, global?: boolean) =>
    request<AssistenteRegra>(baseRegras(global), json("POST", e)),
  editarRegra: (id: string, e: AssistenteEntradaRegra, global?: boolean) =>
    request<AssistenteRegra>(`${baseRegras(global)}/${id}`, json("PATCH", e)),
  removerRegra: (id: string, global?: boolean) => request<void>(`${baseRegras(global)}/${id}`, { method: "DELETE" }),

  memorias: async () => (await request<{ memorias: AssistenteMemoria[] }>(`${base}/memorias`)).memorias,
  criarMemoria: (e: AssistenteEntradaTexto) => request<AssistenteMemoria>(`${base}/memorias`, json("POST", e)),
  editarMemoria: (id: string, e: AssistenteEntradaTexto) =>
    request<AssistenteMemoria>(`${base}/memorias/${id}`, json("PATCH", e)),
  removerMemoria: (id: string) => request<void>(`${base}/memorias/${id}`, { method: "DELETE" }),

  /** Atalhos do chat. */
  perguntas: async () => (await request<{ perguntas: AssistentePergunta[] }>(`${base}/perguntas`)).perguntas,
  criarPergunta: (e: AssistenteEntradaTexto) => request<AssistentePergunta>(`${base}/perguntas`, json("POST", e)),
  editarPergunta: (id: string, e: AssistenteEntradaTexto) =>
    request<AssistentePergunta>(`${base}/perguntas/${id}`, json("PATCH", e)),
  removerPergunta: (id: string) => request<void>(`${base}/perguntas/${id}`, { method: "DELETE" }),

  /** Só Master. */
  auditoria: async (limite = 100) =>
    (await request<{ registros: AssistenteAuditoriaRegistro[] }>(`${base}/auditoria?limite=${limite}`)).registros,
  permissao: (userId: string) => request<AssistentePermissao>(`${base}/usuarios/${userId}/permissao`),
  salvarPermissao: (userId: string, autorizado: boolean) =>
    request<AssistentePermissao>(`${base}/usuarios/${userId}/permissao`, json("PUT", { autorizado })),
};
