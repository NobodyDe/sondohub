import { describe, expect, it } from 'vitest'
import { assistenteAtivo, lerAlteracao, normalizarVoz, preferenciaEfetiva } from './tipos.js'

describe('assistente/tipos', () => {
  it('normaliza voz desconhecida para Charon', () => {
    expect(normalizarVoz('Kore')).toBe('Kore')
    expect(normalizarVoz('Puck')).toBe('Charon')
    expect(normalizarVoz(undefined)).toBe('Charon')
  })

  it('valida alteração', () => {
    expect(lerAlteracao({ habilitado: true, voz: 'Kore', apiKey: ' abc ' })).toEqual({
      habilitado: true,
      voz: 'Kore',
      apiKey: 'abc',
    })
    expect(lerAlteracao({ internet: true })).toEqual({ internet: true })
    expect(lerAlteracao({ nome: '  Sondinha   IA ' })).toEqual({ nome: 'Sondinha IA' })
    expect(lerAlteracao({ nome: '' })).toEqual({ nome: '' })
    expect(lerAlteracao({ nome: 'x'.repeat(41) })).toBeNull()
    expect(lerAlteracao({ nome: 5 })).toBeNull()
    expect(lerAlteracao({ internet: 'sim' })).toBeNull()
    expect(lerAlteracao({ voz: 'Puck' })).toBeNull()
    expect(lerAlteracao({ nome: '', habilitado: 'sim' })).toBeNull()
    expect(lerAlteracao({ modoMic: 'apertar' })).toEqual({ modoMic: 'apertar' })
    expect(lerAlteracao({ modoMic: 'x' })).toBeNull()
    expect(lerAlteracao(null)).toBeNull()
    expect(lerAlteracao({})).toEqual({})
  })

  it('só fica ativo com habilitado e chave', () => {
    expect(assistenteAtivo({ nome: '', habilitado: true, voz: 'Kore', chaveConfigurada: false, internet: false })).toBe(false)
    expect(assistenteAtivo({ nome: '', habilitado: false, voz: 'Kore', chaveConfigurada: true, internet: false })).toBe(false)
    expect(assistenteAtivo({ nome: '', habilitado: true, voz: 'Kore', chaveConfigurada: true, internet: false })).toBe(true)
    // chave própria dispensa a global; desligado continua desligado
    expect(assistenteAtivo({ nome: '', habilitado: true, voz: 'Kore', chaveConfigurada: false, internet: false }, true)).toBe(true)
    expect(assistenteAtivo({ nome: '', habilitado: false, voz: 'Kore', chaveConfigurada: false, internet: false }, true)).toBe(false)
  })
})

describe('apelido', () => {
  it('aceita, limpa espaços e permite vazio', () => {
    expect(lerAlteracao({ apelido: '  Dr.   Leo ' })?.apelido).toBe('Dr. Leo')
    expect(lerAlteracao({ apelido: '' })?.apelido).toBe('')
  })
  it('recusa não-texto e acima de 40', () => {
    expect(lerAlteracao({ apelido: 3 })).toBeNull()
    expect(lerAlteracao({ apelido: 'x'.repeat(41) })).toBeNull()
  })

  it('chat de texto: valida e a preferência efetiva depende do chat', () => {
    expect(lerAlteracao({ chatTexto: false, preferencia: 'texto' })).toEqual({ chatTexto: false, preferencia: 'texto' })
    expect(lerAlteracao({ chatTexto: 'sim' })).toBeNull()
    expect(lerAlteracao({ preferencia: 'misto' })).toBeNull()
    expect(preferenciaEfetiva(true, 'texto')).toBe('texto')
    expect(preferenciaEfetiva(false, 'texto')).toBe('voz')
  })
})
