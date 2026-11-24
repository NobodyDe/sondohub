export const MAX_PERGUNTAS = 12
export const MAX_TEXTO_PERGUNTA = 200

export type Pergunta = { id: string; texto: string; ativo: boolean }
export type EntradaPergunta = { texto?: string; ativo?: boolean }

/** Valida criação (`parcial=false`: texto obrigatório) ou edição. `null` = inválido. */
export function lerEntradaPergunta(corpo: unknown, parcial: boolean): EntradaPergunta | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  const b = corpo as Record<string, unknown>
  const saida: EntradaPergunta = {}
  if ('texto' in b || !parcial) {
    if (typeof b.texto !== 'string') return null
    const texto = b.texto.trim().replace(/\s+/g, ' ')
    if (!texto || texto.length > MAX_TEXTO_PERGUNTA) return null
    saida.texto = texto
  }
  if ('ativo' in b) {
    if (typeof b.ativo !== 'boolean') return null
    saida.ativo = b.ativo
  }
  return saida
}
