import { describe, expect, it } from 'vitest'
import { lerEntradaMemoria, renderizarMemorias, textoListaMemorias } from './memorias.js'

describe('renderizarMemorias', () => {
  it('vazio sem memória ativa', () => {
    expect(renderizarMemorias([])).toBe('')
    expect(renderizarMemorias([{ texto: 'x', ativo: false }])).toBe('')
  })

  it('lista só as ativas e cita o nome', () => {
    const bloco = renderizarMemorias(
      [
        { texto: 'Prefere valores arredondados.', ativo: true },
        { texto: 'Antiga.', ativo: false },
      ],
      'Ana',
    )
    expect(bloco).toContain('sobre Ana')
    expect(bloco).toContain('1. Prefere valores arredondados.')
    expect(bloco).not.toContain('Antiga')
  })
})

describe('lerEntradaMemoria', () => {
  it('criação exige texto', () => {
    expect(lerEntradaMemoria({ texto: ' oi ' }, false)).toEqual({ texto: 'oi' })
    expect(lerEntradaMemoria({}, false)).toBeNull()
    expect(lerEntradaMemoria({ texto: ' ' }, false)).toBeNull()
  })

  it('edição aceita parcial e valida limite', () => {
    expect(lerEntradaMemoria({ ativo: false }, true)).toEqual({ ativo: false })
    expect(lerEntradaMemoria({ texto: 'x'.repeat(301) }, true)).toBeNull()
    expect(lerEntradaMemoria({ ativo: 'sim' }, true)).toBeNull()
    expect(lerEntradaMemoria(null, true)).toBeNull()
  })
})

describe('textoListaMemorias', () => {
  it('numera só as ativas', () => {
    const t = textoListaMemorias([
      { texto: 'Prefere valores arredondados.', ativo: true },
      { texto: 'Antiga', ativo: false },
      { texto: 'Chamar de doutor.', ativo: true },
    ])
    expect(t).toBe('1. Prefere valores arredondados.\n2. Chamar de doutor.')
  })

  it('avisa quando vazio', () => {
    expect(textoListaMemorias([])).toMatch(/nenhuma memória/i)
  })
})
