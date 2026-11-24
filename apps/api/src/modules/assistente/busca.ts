import { GoogleGenAI } from '@google/genai'
import { Logger } from '@nestjs/common'

export type ResultadoBusca = { titulo: string; resumo: string }

const logger = new Logger('Assistente')

const MODELO_BUSCA = (process.env.GEMINI_SEARCH_MODEL || 'gemini-3.8-flash').trim()
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
/** Busca do Gemini exige faturamento: após falhar, pula por um tempo para não somar latência. */
const PAUSA_GEMINI_MS = 10 * 60_000
let geminiPausadoAte = 0

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&nbsp;': ' ' }

function limpar(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#x27|#39);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai título e resumo da página HTML do DuckDuckGo. */
export function extrairResultadosDdg(html: string, max = 5): ResultadoBusca[] {
  const titulos = [...html.matchAll(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => limpar(m[1]))
  const resumos = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => limpar(m[1]))
  const saida: ResultadoBusca[] = []
  for (let i = 0; i < titulos.length && saida.length < max; i += 1) {
    if (titulos[i]) saida.push({ titulo: titulos[i], resumo: resumos[i] ?? '' })
  }
  return saida
}

export function formatarResultados(consulta: string, resultados: ResultadoBusca[]): string {
  if (resultados.length === 0) return `Nenhum resultado para: ${consulta}`
  const linhas = [`Resultados para: ${consulta}`]
  resultados.forEach((r, i) => {
    linhas.push(`${i + 1}. ${r.titulo}`)
    if (r.resumo) linhas.push(`   ${r.resumo}`)
  })
  return linhas.join('\n')
}

async function buscaGemini(consulta: string, chave: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: chave, httpOptions: { apiVersion: 'v1beta' } })
  const r = await ai.models.generateContent({
    model: MODELO_BUSCA,
    contents:
      'Responda em português do Brasil, no máximo 4 frases curtas, só com o fato pedido. Consulta: ' + consulta,
    config: { tools: [{ googleSearch: {} }] },
  })
  return (r.text ?? '').trim()
}

/** Itens do RSS do Google Notícias (título já traz " - Fonte"). */
export function extrairNoticiasRss(xml: string, max = 6): ResultadoBusca[] {
  const itens = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  const saida: ResultadoBusca[] = []
  for (const [, corpo] of itens) {
    const titulo = limpar((corpo.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, ''))
    const data = corpo.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ''
    if (!titulo) continue
    saida.push({ titulo, resumo: data ? `Publicado em ${data}` : '' })
    if (saida.length >= max) break
  }
  return saida
}

async function buscaNoticias(consulta: string): Promise<string> {
  const r = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(consulta)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) },
  )
  if (!r.ok) return ''
  const itens = extrairNoticiasRss(await r.text())
  return itens.length ? formatarResultados(consulta, itens) : ''
}

async function buscaDdg(consulta: string): Promise<string> {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(consulta), {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(6000),
    })
    // 202 = desafio anti-robô passageiro: tenta de novo.
    if (r.status === 200) {
      const resultados = extrairResultadosDdg(await r.text())
      if (resultados.length > 0) return formatarResultados(consulta, resultados)
    }
    await new Promise((res) => setTimeout(res, 400 * (tentativa + 1)))
  }
  return `Nenhum resultado para: ${consulta}`
}

/** Pesquisa na internet para a voz. Gemini com busca; sem ele, Google Notícias e DuckDuckGo. Nunca lança. */
export async function pesquisarWeb(consulta: string, chave: string): Promise<string> {
  const q = consulta.trim().slice(0, 300)
  if (!q) return 'Consulta vazia.'
  if (Date.now() >= geminiPausadoAte) {
    try {
      const texto = await buscaGemini(q, chave)
      if (texto) return texto
    } catch (error) {
      geminiPausadoAte = Date.now() + PAUSA_GEMINI_MS
      logger.warn(`assistente: busca Gemini indisponível, usando DuckDuckGo: ${(error as Error).message.slice(0, 120)}`)
    }
  }
  try {
    const noticias = await buscaNoticias(q)
    if (noticias) return noticias
  } catch (error) {
    logger.warn(`assistente: Google Notícias falhou: ${(error as Error).message}`)
  }
  try {
    return await buscaDdg(q)
  } catch (error) {
    logger.warn(`assistente: busca DuckDuckGo falhou: ${(error as Error).message}`)
    return 'A pesquisa na internet falhou agora. Diga que não conseguiu pesquisar.'
  }
}
