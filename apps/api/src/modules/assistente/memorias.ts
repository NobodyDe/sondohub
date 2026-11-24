export const MAX_MEMORIAS = 50
export const MAX_TEXTO_MEMORIA = 300

export type Memoria = { id: string; texto: string; origem: 'usuario' | 'assistente'; ativo: boolean }
export type EntradaMemoria = { texto?: string; ativo?: boolean }

/** Bloco que entra no prompt. Vazio se não houver memória ativa. */
export function renderizarMemorias(memorias: Pick<Memoria, 'texto' | 'ativo'>[], nome = ''): string {
  const ativas = memorias.filter((m) => m.ativo && m.texto.trim())
  if (ativas.length === 0) return ''
  const de = nome ? ` sobre ${nome}` : ''
  return [
    `Memórias${de}, salvas pela própria pessoa ou por você em conversas anteriores. Trate cada uma como instrução ou fato permanente: siga as que dizem como agir e use as que descrevem a pessoa ou o trabalho dela. Não as leia em voz alta sem ser pedido. Se pedirem para rever ou conferir a memória, ou se houver dúvida sobre uma delas, chame listar_memorias (lê a lista atual, que pode ter mudado desde o início da conversa).`,
    ...ativas.map((m, i) => `${i + 1}. ${m.texto.trim()}`),
  ].join('\n')
}

/** Lista numerada para o modelo ler (ferramenta `listar_memorias`). Só as ativas. */
export function textoListaMemorias(memorias: Pick<Memoria, 'texto' | 'ativo'>[]): string {
  const ativas = memorias.filter((m) => m.ativo && m.texto.trim())
  if (ativas.length === 0) return 'Não há nenhuma memória salva.'
  return ativas.map((m, i) => `${i + 1}. ${m.texto.trim()}`).join('\n')
}

/** Valida criação (`parcial=false`: texto obrigatório) ou edição. `null` = inválido. */
export function lerEntradaMemoria(corpo: unknown, parcial: boolean): EntradaMemoria | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  const b = corpo as Record<string, unknown>
  const saida: EntradaMemoria = {}
  if ('texto' in b || !parcial) {
    if (typeof b.texto !== 'string') return null
    const texto = b.texto.trim()
    if (!texto || texto.length > MAX_TEXTO_MEMORIA) return null
    saida.texto = texto
  }
  if ('ativo' in b) {
    if (typeof b.ativo !== 'boolean') return null
    saida.ativo = b.ativo
  }
  return saida
}
