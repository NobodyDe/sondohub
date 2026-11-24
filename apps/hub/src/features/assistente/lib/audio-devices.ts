/** Microfone e saída de áudio do assistente. O id do dispositivo vale só neste navegador, então fica no localStorage. */

export type DispositivoAudio = { id: string; rotulo: string }
export type PrefAudio = { entrada?: DispositivoAudio; saida?: DispositivoAudio }

const CHAVE = 'sondohub.assistente.audio'

const dispositivoValido = (v: unknown): DispositivoAudio | undefined => {
  if (!v || typeof v !== 'object') return undefined
  const d = v as Record<string, unknown>
  return typeof d.id === 'string' && d.id && typeof d.rotulo === 'string' ? { id: d.id, rotulo: d.rotulo.slice(0, 200) } : undefined
}

export function lerPrefAudio(): PrefAudio {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Record<string, unknown>
    return { entrada: dispositivoValido(bruto.entrada), saida: dispositivoValido(bruto.saida) }
  } catch {
    return {}
  }
}

export function salvarPrefAudio(pref: PrefAudio): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(pref))
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Acha o dispositivo salvo: pelo id e, se o navegador trocou os ids (permissão limpa), pelo nome. */
export function escolherDispositivo(lista: DispositivoAudio[], pref?: DispositivoAudio): string | undefined {
  if (!pref) return undefined
  const porId = lista.find((d) => d.id === pref.id)
  if (porId) return porId.id
  const alvo = normalizar(pref.rotulo)
  if (!alvo) return undefined
  return lista.find((d) => normalizar(d.rotulo) === alvo)?.id
}

export type DispositivosAudio = { entradas: DispositivoAudio[]; saidas: DispositivoAudio[]; semNomes: boolean }

/** Sem permissão de microfone o navegador esconde os nomes (`semNomes`): peça a permissão e liste de novo. */
export async function listarDispositivosAudio(): Promise<DispositivosAudio> {
  const todos = await navigator.mediaDevices.enumerateDevices()
  const montar = (tipo: MediaDeviceKind) =>
    todos
      .filter((d) => d.kind === tipo && d.deviceId !== 'communications')
      .map((d, i) => ({
        id: d.deviceId,
        rotulo: d.deviceId === 'default' ? 'Padrão do sistema' : d.label || (tipo === 'audioinput' ? `Microfone ${i + 1}` : `Saída ${i + 1}`),
      }))
  const entradas = montar('audioinput')
  const saidas = montar('audiooutput')
  const semNomes = todos.some((d) => (d.kind === 'audioinput' || d.kind === 'audiooutput') && !d.label)
  return { entradas, saidas, semNomes }
}

/** Escolher a saída só funciona onde o AudioContext tem `setSinkId` (Chrome/Edge). Safari/iOS usam a saída do sistema. */
export const saidaSelecionavel = () => typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype
