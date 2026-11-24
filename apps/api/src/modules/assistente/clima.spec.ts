import { describe, expect, it } from 'vitest'
import { descreverClima, formatarPrevisao } from './clima.js'

describe('clima', () => {
  it('traduz códigos WMO', () => {
    expect(descreverClima(0)).toBe('céu limpo')
    expect(descreverClima(61)).toBe('chuva')
    expect(descreverClima(999)).toBe('tempo variável')
  })

  it('formata agora, hoje, amanhã e dia da semana', () => {
    const txt = formatarPrevisao({
      local: 'São Paulo, São Paulo',
      agora: { temperatura: 26.9, sensacao: 28.3, codigo: 0 },
      dias: [
        { data: '2026-11-17', min: 18.2, max: 29.4, chuva: 40, codigo: 80 },
        { data: '2026-11-18', min: 17, max: 25, chuva: 70, codigo: 61 },
        { data: '2026-11-19', min: 16, max: 24, chuva: 10, codigo: 3 },
      ],
    })
    expect(txt).toContain('Agora: 27°C (sensação 28°C), céu limpo.')
    expect(txt).toContain('hoje: mínima 18°C, máxima 29°C, pancadas de chuva, chance de chuva 40%.')
    expect(txt).toContain('amanhã:')
    expect(txt).toContain('quinta-feira: mínima 16°C')
  })
})
