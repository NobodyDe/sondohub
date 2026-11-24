import { describe, expect, it } from 'vitest'
import { pcm16ParaFloat, reduzirTaxa } from './pcm.ts'

describe('reduzirTaxa', () => {
  it('48k para 16k divide o tamanho por 3 e tira a média', () => {
    const entrada = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6])
    const pcm = reduzirTaxa(entrada, 48_000, 16_000)
    expect(pcm.length).toBe(2)
    expect(pcm[0]).toBeGreaterThan(9000)
    expect(pcm[1]).toBeLessThan(-19000)
  })

  it('mesma taxa só converte e satura', () => {
    const pcm = reduzirTaxa(new Float32Array([2, -2, 0]), 16_000, 16_000)
    expect(Array.from(pcm)).toEqual([32767, -32768, 0])
  })
})

describe('pcm16ParaFloat', () => {
  it('lê little-endian e ignora byte sobrando', () => {
    const f = pcm16ParaFloat(new Uint8Array([0x00, 0x40, 0x00, 0xc0, 0x01]))
    expect(f.length).toBe(2)
    expect(f[0]).toBeCloseTo(0.5)
    expect(f[1]).toBeCloseTo(-0.5)
  })
})
