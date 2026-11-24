const URL_MODELOS = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'

export type ResultadoChave = { valida: boolean; mensagem: string }

/** Pergunta ao Gemini se a chave é aceita (lista de modelos; não gasta cota de geração). */
export async function validarChaveGemini(
  chave: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoChave> {
  if (!chave.trim()) return { valida: false, mensagem: 'Chave vazia.' }
  try {
    const r = await buscar(URL_MODELOS, {
      headers: { 'x-goog-api-key': chave.trim() },
      signal: AbortSignal.timeout(8000),
    })
    if (r.ok) return { valida: true, mensagem: 'Chave válida.' }
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      return { valida: false, mensagem: 'Chave inválida ou sem permissão.' }
    }
    if (r.status === 429) return { valida: true, mensagem: 'Chave válida, mas com a cota esgotada agora.' }
    return { valida: false, mensagem: `O Gemini respondeu ${r.status}. Tente de novo.` }
  } catch {
    return { valida: false, mensagem: 'Não foi possível falar com o Gemini. Tente de novo.' }
  }
}
