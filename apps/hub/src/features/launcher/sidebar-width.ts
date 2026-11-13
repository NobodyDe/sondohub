export const SIDEBAR_MAX_WIDTH = 240; // largura padrão
export const SIDEBAR_COLLAPSED_WIDTH = 72; // modo recolhido: só ícones
const SIDEBAR_MIN_WIDTH = 200; // abaixo disso o conteúdo não cabe, então recolhe

/** Converte a posição do mouse na largura da sidebar: recolhe abaixo do mínimo e nunca passa do máximo. */
export function widthFromPointer(pointerX: number) {
  if (pointerX < SIDEBAR_MIN_WIDTH) return SIDEBAR_COLLAPSED_WIDTH;
  return Math.min(pointerX, SIDEBAR_MAX_WIDTH);
}
