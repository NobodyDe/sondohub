import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.ASSISTENTE_CHAVE_SECRETA = 'segredo-de-teste'
})

describe('assistente/cripto', () => {
  it('ida e volta', async () => {
    const { criptografar, descriptografar } = await import('./cripto.js')
    const token = criptografar('AIza-chave')
    expect(token).not.toContain('AIza')
    expect(descriptografar(token)).toBe('AIza-chave')
  })

  it('token adulterado ou lixo devolve null', async () => {
    const { criptografar, descriptografar } = await import('./cripto.js')
    const token = criptografar('x')
    const [iv, tag, dados] = token.split('.')
    expect(descriptografar(`${iv}.${tag}.${Buffer.from('outro').toString('base64')}`)).toBeNull()
    expect(descriptografar('lixo')).toBeNull()
    expect(dados).toBeTruthy()
  })
})
