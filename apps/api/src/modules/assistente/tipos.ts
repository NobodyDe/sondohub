export const VOZES = ['Charon', 'Kore'] as const
export type Voz = (typeof VOZES)[number]
export const VOZ_PADRAO: Voz = 'Charon'

export const MAX_NOME_ASSISTENTE = 40
export const MAX_APELIDO = 40

export const MODOS_MIC = ['aberto', 'apertar'] as const
export type ModoMic = (typeof MODOS_MIC)[number]

/** O que o robô abre ao toque: conversa por voz ou chat de texto. */
export const PREFERENCIAS = ['voz', 'texto'] as const
export type PreferenciaAssistente = (typeof PREFERENCIAS)[number]

export type ConfigAssistente = {
  habilitado: boolean
  /** Nome do assistente; vazio = ele pergunta ao usuário. */
  nome: string
  /** Como a pessoa quer ser chamada; vazio = primeiro nome do cadastro. */
  apelido: string
  voz: Voz
  internet: boolean
  /** Microfone sempre aberto ou só enquanto o botão está apertado. */
  modoMic: ModoMic
  /** Chat de texto ligado para o usuário. */
  chatTexto: boolean
  /** O que o robô abre ao toque. Sem chat, é sempre `voz`. */
  preferencia: PreferenciaAssistente
  chaveConfigurada: boolean
}

/** Sem chat ligado, o robô só abre por voz. */
export function preferenciaEfetiva(chatTexto: boolean, preferencia: PreferenciaAssistente): PreferenciaAssistente {
  return chatTexto ? preferencia : 'voz'
}

export function normalizarVoz(valor: unknown): Voz {
  return (VOZES as readonly string[]).includes(valor as string) ? (valor as Voz) : VOZ_PADRAO
}

export type AlteracaoConfig = {
  habilitado?: boolean
  voz?: Voz
  internet?: boolean
  /** `''` limpa o nome. */
  nome?: string
  /** `''` volta a usar o primeiro nome do cadastro. */
  apelido?: string
  modoMic?: ModoMic
  chatTexto?: boolean
  preferencia?: PreferenciaAssistente
  /** `''` remove a chave; ausente mantém. */
  apiKey?: string
}

/** Valida o corpo do PUT. Devolve `null` se algo veio inválido. */
export function lerAlteracao(corpo: unknown): AlteracaoConfig | null {
  if (typeof corpo !== 'object' || corpo === null) return null
  const bruto = corpo as Record<string, unknown>
  const saida: AlteracaoConfig = {}
  if ('habilitado' in bruto) {
    if (typeof bruto.habilitado !== 'boolean') return null
    saida.habilitado = bruto.habilitado
  }
  if ('internet' in bruto) {
    if (typeof bruto.internet !== 'boolean') return null
    saida.internet = bruto.internet
  }
  if ('nome' in bruto) {
    if (typeof bruto.nome !== 'string') return null
    const nome = bruto.nome.trim().replace(/\s+/g, ' ')
    if (nome.length > MAX_NOME_ASSISTENTE) return null
    saida.nome = nome
  }
  if ('apelido' in bruto) {
    if (typeof bruto.apelido !== 'string') return null
    const apelido = bruto.apelido.trim().replace(/\s+/g, ' ')
    if (apelido.length > MAX_APELIDO) return null
    saida.apelido = apelido
  }
  if ('modoMic' in bruto) {
    if (!(MODOS_MIC as readonly string[]).includes(bruto.modoMic as string)) return null
    saida.modoMic = bruto.modoMic as ModoMic
  }
  if ('chatTexto' in bruto) {
    if (typeof bruto.chatTexto !== 'boolean') return null
    saida.chatTexto = bruto.chatTexto
  }
  if ('preferencia' in bruto) {
    if (!(PREFERENCIAS as readonly string[]).includes(bruto.preferencia as string)) return null
    saida.preferencia = bruto.preferencia as PreferenciaAssistente
  }
  if ('voz' in bruto) {
    if (!(VOZES as readonly string[]).includes(bruto.voz as string)) return null
    saida.voz = bruto.voz as Voz
  }
  if ('apiKey' in bruto) {
    if (typeof bruto.apiKey !== 'string' || bruto.apiKey.length > 200) return null
    saida.apiKey = bruto.apiKey.trim()
  }
  return saida
}

/** A bolinha só aparece com o assistente ligado e uma chave: a global ou a do próprio usuário. */
export function assistenteAtivo(config: ConfigAssistente, chavePropria = false): boolean {
  return config.habilitado && (config.chaveConfigurada || chavePropria)
}
