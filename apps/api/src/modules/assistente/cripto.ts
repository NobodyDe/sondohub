import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function chave(): Buffer {
  const base = process.env.ASSISTENTE_CHAVE_SECRETA?.trim()
  if (!base) throw new Error('ASSISTENTE_CHAVE_SECRETA não definida')
  return createHash('sha256').update(`sondohub.assistente:${base}`).digest()
}

/** AES-256-GCM. Formato: iv.tag.dados (base64). */
export function criptografar(texto: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [iv, cifra.getAuthTag(), dados].map((parte) => parte.toString('base64')).join('.')
}

export function descriptografar(token: string): string | null {
  try {
    const [iv, tag, dados] = token.split('.').map((parte) => Buffer.from(parte, 'base64'))
    if (!iv || !tag || !dados) return null
    const decifra = createDecipheriv('aes-256-gcm', chave(), iv)
    decifra.setAuthTag(tag)
    return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8')
  } catch {
    return null
  }
}
