import { describe, expect, it } from 'vitest'
import { micLiberado } from './mic-mode.ts'

describe('micLiberado', () => {
  it('aberto sempre envia', () => {
    expect(micLiberado('aberto', false)).toBe(true)
    expect(micLiberado('aberto', true)).toBe(true)
  })
  it('apertar só envia segurando', () => {
    expect(micLiberado('apertar', false)).toBe(false)
    expect(micLiberado('apertar', true)).toBe(true)
  })
})
