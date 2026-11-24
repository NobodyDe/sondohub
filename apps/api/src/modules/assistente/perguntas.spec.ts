import { describe, expect, it } from 'vitest'
import { lerEntradaPergunta } from './perguntas.js'

describe('lerEntradaPergunta', () => {
  it('criação exige texto e limpa espaços', () => {
    expect(lerEntradaPergunta({ texto: '  Quais   obras atrasaram? ' }, false)).toEqual({ texto: 'Quais obras atrasaram?' })
    expect(lerEntradaPergunta({}, false)).toBeNull()
    expect(lerEntradaPergunta({ texto: '   ' }, false)).toBeNull()
  })
  it('edição aceita parcial e valida limites', () => {
    expect(lerEntradaPergunta({ ativo: false }, true)).toEqual({ ativo: false })
    expect(lerEntradaPergunta({ texto: 'x'.repeat(201) }, true)).toBeNull()
    expect(lerEntradaPergunta({ ativo: 'sim' }, true)).toBeNull()
    expect(lerEntradaPergunta(null, true)).toBeNull()
  })
})
