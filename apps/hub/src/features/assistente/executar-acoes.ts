import type { AssistentePropostaOperacao, AssistentePropostaResumo } from "@sondohub/contracts";
import { useNavigate } from "react-router";
import { trackAppClick } from "../launcher/track-app-click.ts";

/** Ação pedida pelo servidor (formato em apps/api/src/modules/assistente/acoes.ts). */
export type AcaoAssistente = {
  id?: string;
  tipo: "navegar" | "abrir_app" | "voltar" | "confirmar_escrita";
  descricao: string;
  rota?: string;
  slug?: string;
  url?: string;
  proposta?: AssistentePropostaResumo;
};

export type ResultadoAcao = { ok: boolean; detalhe?: string };

const OPERACOES_VALIDAS = new Set<AssistentePropostaOperacao>([
  "liberar_app",
  "remover_app",
  "autorizar_assistente",
  "alterar_cargo",
  "alterar_status",
]);

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);

function lerProposta(bruto: unknown): AssistentePropostaResumo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const p = bruto as Record<string, unknown>;
  const id = texto(p.id, 80);
  const operacao = texto(p.operacao, 40) as AssistentePropostaOperacao | undefined;
  const titulo = texto(p.titulo, 120);
  const descricao = texto(p.descricao, 300);
  const detalhe = texto(p.detalhe, 300);
  const expiraEm = texto(p.expiraEm, 60) ?? "";
  const alvo = p.usuarioAlvo as Record<string, unknown> | undefined;
  const alvoId = texto(alvo?.id, 80);
  const alvoNome = texto(alvo?.nome, 120);
  const alvoEmail = texto(alvo?.email, 160);
  if (!id || !operacao || !OPERACOES_VALIDAS.has(operacao) || !titulo || !descricao || !detalhe || !alvoId || !alvoNome || !alvoEmail) {
    return null;
  }
  return {
    id,
    operacao,
    titulo,
    descricao,
    detalhe,
    expiraEm,
    usuarioAlvo: { id: alvoId, nome: alvoNome, email: alvoEmail },
  };
}

/** O servidor é de confiança, mas a ação vira navegação ou card: só rotas internas, urls http(s) e propostas válidas passam. */
export function lerAcao(bruto: unknown): AcaoAssistente | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const base = { id: texto(b.id, 40), descricao: texto(b.descricao) ?? "" };

  if (b.tipo === "voltar") return { ...base, tipo: "voltar" };

  if (b.tipo === "navegar") {
    const rota = texto(b.rota);
    if (!rota?.startsWith("/") || rota.startsWith("//") || rota.includes("\\")) return null;
    return { ...base, tipo: "navegar", rota };
  }

  if (b.tipo === "abrir_app") {
    const slug = texto(b.slug, 80);
    const url = texto(b.url, 2000);
    if (!slug || !url) return null;
    try {
      if (!/^https?:$/.test(new URL(url).protocol)) return null;
    } catch {
      return null;
    }
    return { ...base, tipo: "abrir_app", slug, url };
  }

  if (b.tipo === "confirmar_escrita") {
    const proposta = lerProposta(b.proposta);
    if (!proposta) return null;
    return { ...base, tipo: "confirmar_escrita", proposta };
  }

  return null;
}

/** Executa a ação no navegador e devolve o que de fato aconteceu (vira o `acao_resultado`). */
export function useExecutarAcoes(aoReceberProposta?: (proposta: AssistentePropostaResumo) => void) {
  const navigate = useNavigate();
  return async (acao: AcaoAssistente): Promise<ResultadoAcao> => {
    if (acao.tipo === "voltar") {
      void navigate(-1);
      return { ok: true };
    }
    if (acao.tipo === "navegar" && acao.rota) {
      void navigate(acao.rota);
      return { ok: true };
    }
    if (acao.tipo === "abrir_app" && acao.slug && acao.url) {
      trackAppClick(acao.slug);
      // Mesmo comportamento do card do launcher (mesma aba). O atraso deixa o ack sair antes da página trocar.
      window.setTimeout(() => window.location.assign(acao.url!), 300);
      return { ok: true };
    }
    if (acao.tipo === "confirmar_escrita" && acao.proposta) {
      aoReceberProposta?.(acao.proposta);
      return { ok: true, detalhe: "cartão de confirmação exibido na tela" };
    }
    return { ok: false, detalhe: "ação não suportada" };
  };
}
