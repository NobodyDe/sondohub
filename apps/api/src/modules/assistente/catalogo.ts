import {
  FERRAMENTAS_HUB,
  FERRAMENTAS_INTERNET,
  FERRAMENTAS_MASTER,
  FERRAMENTAS_MEMORIA,
  FERRAMENTAS_TELA,
} from './ferramentas.js';

/** Fonte única das ferramentas da sessão: a lista enviada ao Gemini sai daqui. */
export function ferramentasDaSessao({ internet, master }: { internet: boolean; master: boolean }) {
  return [
    ...FERRAMENTAS_HUB,
    ...(master ? FERRAMENTAS_MASTER : []),
    ...FERRAMENTAS_TELA,
    ...FERRAMENTAS_MEMORIA,
    ...(internet ? FERRAMENTAS_INTERNET : []),
  ];
}

export const NOMES_FERRAMENTAS = ferramentasDaSessao({ internet: true, master: true }).map((f) => f.name);
