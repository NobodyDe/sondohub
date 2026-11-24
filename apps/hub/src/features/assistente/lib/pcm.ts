/** Taxa do áudio que o Gemini Live devolve (PCM16 mono). */
export const TAXA_SAIDA = 24_000
/** Taxa do áudio que o microfone envia. */
export const TAXA_ENTRADA = 16_000

/** Float32 do microfone para PCM16. Cada amostra de saída é a média do bloco (evita serrilhado). */
export function reduzirTaxa(entrada: Float32Array, taxaEntrada: number, taxaSaida: number): Int16Array<ArrayBuffer> {
  const limitar = (v: number) => {
    const s = Math.max(-1, Math.min(1, v))
    return s < 0 ? s * 0x8000 : s * 0x7fff
  }
  if (taxaEntrada === taxaSaida || taxaEntrada <= 0 || taxaSaida <= 0) {
    const pcm = new Int16Array(entrada.length)
    for (let i = 0; i < entrada.length; i += 1) pcm[i] = limitar(entrada[i])
    return pcm
  }
  const razao = taxaEntrada / taxaSaida
  const n = Math.floor(entrada.length / razao)
  const pcm = new Int16Array(n)
  for (let i = 0; i < n; i += 1) {
    const ini = Math.floor(i * razao)
    let fim = Math.floor((i + 1) * razao)
    if (fim <= ini) fim = ini + 1
    if (fim > entrada.length) fim = entrada.length
    let soma = 0
    for (let j = ini; j < fim; j += 1) soma += entrada[j]
    pcm[i] = limitar(soma / (fim - ini))
  }
  return pcm
}

/** PCM16 little-endian (bytes do servidor) para Float32 [-1, 1]. Byte sobrando é descartado. */
export function pcm16ParaFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const n = bytes.length >> 1
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  const saida = new Float32Array(n)
  for (let i = 0; i < n; i += 1) saida[i] = view.getInt16(i * 2, true) / 32768
  return saida
}
