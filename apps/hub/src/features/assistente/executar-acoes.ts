import { useNavigate } from "react-router";
import { trackAppClick } from "../launcher/track-app-click.ts";

/** Ação pedida pelo servidor (formato em apps/api/src/modules/assistente/acoes.ts). */
export type AcaoAssistente = {
  id?: string;
  tipo: "navegar" | "abrir_app" | "voltar";
  descricao: string;
  rota?: string;
  slug?: string;
  url?: string;
};

export type ResultadoAcao = { ok: boolean; detalhe?: string };

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** O servidor é de confiança, mas a ação vira navegação: só rota do próprio hub e url http(s) passam. */
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
  return null;
}

/** Executa a ação no navegador e devolve o que de fato aconteceu (vira o `acao_resultado`). */
export function useExecutarAcoes() {
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
    return { ok: false, detalhe: "ação não suportada" };
  };
}
