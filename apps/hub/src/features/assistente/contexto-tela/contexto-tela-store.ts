import { useEffect, useSyncExternalStore } from "react";

export type EstadoTelaAssistente = Record<string, unknown> | null;

let estadoAtual: EstadoTelaAssistente = null;
const ouvintes = new Set<() => void>();

function notificar() {
  for (const fn of ouvintes) fn();
}

export function publicarEstadoTela(novo: EstadoTelaAssistente) {
  const igual = JSON.stringify(estadoAtual) === JSON.stringify(novo);
  if (igual) return;
  estadoAtual = novo;
  notificar();
}

export function lerEstadoTela(): EstadoTelaAssistente {
  return estadoAtual;
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Lê de forma reativa o estado publicado pela página aberta (usado pelo AssistenteBolinha). */
export function useEstadoTelaAssistente(): EstadoTelaAssistente {
  return useSyncExternalStore(assinar, lerEstadoTela, () => null);
}

/**
 * Inspirado no `useCopilotReadable` (CopilotKit): cada página publica seu estado vivo
 * (ex.: usuário aberto na tela, filtro ativo, período do painel) para a ferramenta `ver_tela`.
 * Ao sair da página, limpa o estado automaticamente.
 */
export function usePublicarContextoTela(estado: EstadoTelaAssistente) {
  const serializado = JSON.stringify(estado);
  useEffect(() => {
    const parsed = serializado ? (JSON.parse(serializado) as EstadoTelaAssistente) : null;
    publicarEstadoTela(parsed);
    return () => {
      publicarEstadoTela(null);
    };
  }, [serializado]);
}
