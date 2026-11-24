import { describe, expect, it } from 'vitest'
import { escolherDispositivo } from './audio-devices.ts'

const lista = [
  { id: 'default', rotulo: 'Padrão do sistema' },
  { id: 'abc', rotulo: 'Headset USB' },
]

describe('escolherDispositivo', () => {
  it('sem preferência, usa o padrão', () => {
    expect(escolherDispositivo(lista, undefined)).toBeUndefined()
  })
  it('acha pelo id', () => {
    expect(escolherDispositivo(lista, { id: 'abc', rotulo: 'x' })).toBe('abc')
  })
  it('id trocado: acha pelo nome, sem acento nem caixa', () => {
    expect(escolherDispositivo(lista, { id: 'velho', rotulo: 'headset usb' })).toBe('abc')
  })
  it('sumiu: padrão', () => {
    expect(escolherDispositivo(lista, { id: 'velho', rotulo: 'Outro' })).toBeUndefined()
  })
})
