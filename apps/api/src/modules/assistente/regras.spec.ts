import { describe, expect, it } from 'vitest'
import { carimbarRegras, lerEntradaRegra, renderizarRegras } from './regras.js'

describe('renderizarRegras', () => {
  it('vazio sem regra ativa', () => {
    expect(renderizarRegras([])).toBe('')
    expect(renderizarRegras([{ texto: 'x', ativo: false }])).toBe('')
  })

  it('lista só as ativas', () => {
    const bloco = renderizarRegras([
      { texto: 'Não fale de política.', ativo: true },
      { texto: 'Não fale de futebol.', ativo: false },
    ])
    expect(bloco).toContain('- Não fale de política.')
    expect(bloco).not.toContain('futebol')
    expect(bloco).toContain('obrigatórias')
  })
})

describe('renderizarRegras globais', () => {
  it('separa as da empresa das da pessoa', () => {
    const bloco = renderizarRegras(
      [{ texto: 'Me chame de chefe.', ativo: true }],
      [{ texto: 'Não fale de política.', ativo: true }],
    )
    expect(bloco.indexOf('Regras da empresa')).toBeLessThan(bloco.indexOf('Regras desta pessoa'))
    expect(bloco).toContain('- Não fale de política.')
    expect(bloco).toContain('- Me chame de chefe.')
  })
  it('só globais', () => {
    const bloco = renderizarRegras([], [{ texto: 'x', ativo: true }])
    expect(bloco).toContain('Regras da empresa')
    expect(bloco).not.toContain('desta pessoa')
  })
})

describe('lerEntradaRegra', () => {
  it('criação exige nome e texto', () => {
    expect(lerEntradaRegra({ nome: 'A', texto: 'B' }, false)).toEqual({ nome: 'A', texto: 'B' })
    expect(lerEntradaRegra({ nome: 'A' }, false)).toBeNull()
    expect(lerEntradaRegra({ nome: ' ', texto: 'B' }, false)).toBeNull()
  })

  it('edição aceita parcial e valida limites', () => {
    expect(lerEntradaRegra({ ativo: false }, true)).toEqual({ ativo: false })
    expect(lerEntradaRegra({ texto: 'x'.repeat(501) }, true)).toBeNull()
    expect(lerEntradaRegra({ ativo: 'sim' }, true)).toBeNull()
  })
})

describe('carimbarRegras', () => {
  it('sem regra devolve o resultado puro', () => {
    expect(carimbarRegras('res', '')).toBe('res')
  })
  it('com regra antecede o resultado', () => {
    const r = carimbarRegras('res', '- Não fale de política.')
    expect(r).toContain('- Não fale de política.')
    expect(r.endsWith('res')).toBe(true)
  })
})

import { ferramentasBloqueadas } from './regras.js'

describe('precedência e bloqueio', () => {
  it('a regra da empresa vence a da pessoa', () => {
    expect(renderizarRegras([], [{ texto: 'x', ativo: true }])).toContain('vale a da empresa')
  })
  it('une bloqueios só das regras ativas', () => {
    const b = ferramentasBloqueadas(
      [{ ativo: true, bloqueia: ['pesquisar_web'] }],
      [{ ativo: false, bloqueia: ['abrir_midia'] }, { ativo: true, bloqueia: ['consultar_anexos'] }],
    )
    expect([...b].sort()).toEqual(['consultar_anexos', 'pesquisar_web'])
  })
  it('valida bloqueia', () => {
    expect(lerEntradaRegra({ nome: 'A', texto: 'B', bloqueia: ['abrir_midia'] }, false)?.bloqueia).toEqual(['abrir_midia'])
    expect(lerEntradaRegra({ nome: 'A', texto: 'B', bloqueia: ['Abrir Mídia'] }, false)).toBeNull()
    expect(lerEntradaRegra({ nome: 'A', texto: 'B', bloqueia: 'x' }, false)).toBeNull()
  })
  it('adversarial: pedir por sinônimo ainda cai na regra', () => {
    const bloco = renderizarRegras([], [{ texto: 'Não fale de política.', ativo: true }])
    expect(bloco).toContain('Sinônimo e assunto parecido também caem na regra')
    expect(bloco).toContain('Vale também para ações')
  })
})
