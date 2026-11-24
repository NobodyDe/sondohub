import { describe, expect, it } from 'vitest'
import { validarChaveGemini } from './validar-chave.js'

const resp = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch

describe('validarChaveGemini', () => {
  it('200 é válida e a chave vai no header, não na URL', async () => {
    let url = ''
    let header = ''
    const f = (async (u: string, init: RequestInit) => {
      url = u
      header = (init.headers as Record<string, string>)['x-goog-api-key']
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    expect((await validarChaveGemini(' abc ', f)).valida).toBe(true)
    expect(header).toBe('abc')
    expect(url).not.toContain('abc')
  })
  it('400/403 inválida', async () => {
    expect((await validarChaveGemini('x', resp(400))).valida).toBe(false)
    expect((await validarChaveGemini('x', resp(403))).valida).toBe(false)
  })
  it('429 válida com aviso; 500 e rede falham', async () => {
    const r = await validarChaveGemini('x', resp(429))
    expect(r.valida).toBe(true)
    expect(r.mensagem).toContain('cota')
    expect((await validarChaveGemini('x', resp(500))).valida).toBe(false)
    const erro = (async () => {
      throw new Error('rede')
    }) as unknown as typeof fetch
    expect((await validarChaveGemini('x', erro)).valida).toBe(false)
  })
  it('vazia', async () => {
    expect((await validarChaveGemini('  ', resp(200))).valida).toBe(false)
  })
})
