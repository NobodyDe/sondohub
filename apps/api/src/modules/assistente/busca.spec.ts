import { describe, expect, it } from 'vitest'
import { extrairNoticiasRss, extrairResultadosDdg, formatarResultados } from './busca.js'

const HTML = `
<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=x">Previsão em <b>São Paulo</b> &amp; região</a>
<a class="result__snippet" href="#">Máx 28° e mín 18°, <b>chuva</b> à tarde.</a></div>
<div class="result"><a class="result__a" href="#">Segundo</a><a class="result__snippet" href="#">Texto</a></div>`

describe('busca', () => {
  it('extrai título e resumo limpando tags e entidades', () => {
    const r = extrairResultadosDdg(HTML)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ titulo: 'Previsão em São Paulo & região', resumo: 'Máx 28° e mín 18°, chuva à tarde.' })
  })

  it('respeita o máximo e formata', () => {
    expect(extrairResultadosDdg(HTML, 1)).toHaveLength(1)
    expect(formatarResultados('x', [])).toBe('Nenhum resultado para: x')
    expect(formatarResultados('clima', extrairResultadosDdg(HTML, 1))).toContain('1. Previsão em São Paulo')
  })
})

describe('rss', () => {
  it('extrai títulos e data', () => {
    const xml = '<rss><channel><title>x</title><item><title>Dólar cai - Estadão</title><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate></item><item><title><![CDATA[Outra &amp; mais]]></title></item></channel></rss>'
    const r = extrairNoticiasRss(xml)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ titulo: 'Dólar cai - Estadão', resumo: 'Publicado em Tue, 17 Nov 2026 10:00:00 GMT' })
    expect(r[1].titulo).toBe('Outra & mais')
  })
})
