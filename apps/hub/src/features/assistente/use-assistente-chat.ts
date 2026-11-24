import { useCallback, useEffect, useRef, useState } from 'react'
import { lerPrefAudio } from './lib/audio-devices.ts'
import { pcm16ParaFloat, TAXA_SAIDA } from './lib/pcm.ts'
import { aplicarSaida, tratarAcao, urlVoz, type AoReceberAcao } from './use-assistente-voz.ts'

export type MensagemChat = {
  id: number
  papel: 'usuario' | 'assistente' | 'sistema'
  texto: string
}

const CHAVE_VOZ = 'sondohub-chat-voz'

/** A resposta do chat também é lida em voz alta, a menos que a pessoa silencie. */
function lerVozLigada(): boolean {
  try {
    return localStorage.getItem(CHAVE_VOZ) !== '0'
  } catch {
    return true
  }
}

type Msg = { type?: string; text?: string; acao?: unknown }

/**
 * Chat de texto com o assistente: uma sessão própria (`canal: 'texto'`) no mesmo WebSocket da voz.
 * A sessão e o histórico ficam enquanto o robô estiver na tela; "nova conversa" recomeça os dois.
 */
export function useAssistenteChat(aoReceberAcao?: AoReceberAcao) {
  const acaoRef = useRef(aoReceberAcao)
  useEffect(() => {
    acaoRef.current = aoReceberAcao
  })
  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  const [pensando, setPensando] = useState(false)
  const [conectando, setConectando] = useState(false)
  const [erro, setErro] = useState('')
  const [vozLigada, setVozLigada] = useState(lerVozLigada)
  const [falando, setFalando] = useState(false)
  const vozLigadaRef = useRef(vozLigada)
  const ctxRef = useRef<AudioContext | null>(null)
  const fontesRef = useRef<AudioBufferSourceNode[]>([])
  const tocaAteRef = useRef(0)

  const sockRef = useRef<WebSocket | null>(null)
  const prontoRef = useRef(false)
  const filaRef = useRef<string[]>([])
  const seqRef = useRef(0)
  // Todo texto do assistente até a próxima pergunta cai na mesma bolha (inclusive o que vem depois de uma ferramenta).
  const novaRespostaRef = useRef(true)
  const tinhaHistoricoRef = useRef(false)

  const pararSaida = useCallback(() => {
    for (const f of fontesRef.current) {
      try {
        f.stop()
      } catch {
        /* já terminou */
      }
    }
    fontesRef.current = []
    tocaAteRef.current = 0
    setFalando(false)
  }, [])

  /** Cria o áudio no primeiro envio (gesto do usuário, exigido pelos navegadores). */
  const prepararAudio = useCallback(() => {
    if (ctxRef.current || !vozLigadaRef.current) return
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    ctxRef.current = ctx
    void ctx
      .resume()
      .then(() => aplicarSaida(ctx, lerPrefAudio().saida))
      .catch(() => {})
  }, [])

  const tocar = useCallback((bytes: Uint8Array) => {
    const ctx = ctxRef.current
    if (!ctx || !vozLigadaRef.current) return
    const floats = pcm16ParaFloat(bytes)
    if (!floats.length) return
    const buf = ctx.createBuffer(1, floats.length, TAXA_SAIDA)
    buf.copyToChannel(floats, 0)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const inicio = Math.max(tocaAteRef.current, ctx.currentTime + 0.08)
    src.start(inicio)
    tocaAteRef.current = inicio + buf.duration
    fontesRef.current.push(src)
    src.onended = () => {
      fontesRef.current = fontesRef.current.filter((f) => f !== src)
      if (fontesRef.current.length === 0) setFalando(false)
    }
    setFalando(true)
  }, [])

  const definirVoz = useCallback(
    (ligada: boolean) => {
      vozLigadaRef.current = ligada
      setVozLigada(ligada)
      try {
        localStorage.setItem(CHAVE_VOZ, ligada ? '1' : '0')
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      if (ligada) prepararAudio()
      else pararSaida()
    },
    [pararSaida, prepararAudio],
  )

  const encerrar = useCallback(() => {
    pararSaida()
    const ctx = ctxRef.current
    ctxRef.current = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
    const sock = sockRef.current
    sockRef.current = null
    prontoRef.current = false
    filaRef.current = []
    try {
      sock?.close()
    } catch {
      /* ignora */
    }
    setConectando(false)
    setPensando(false)
  }, [])

  const conectar = useCallback(() => {
    if (sockRef.current) return
    setErro('')
    setConectando(true)
    const sock = new WebSocket(urlVoz())
    sock.binaryType = 'arraybuffer'
    sockRef.current = sock

    sock.onopen = () => sock.send(JSON.stringify({ type: 'auth', canal: 'texto' }))
    sock.onclose = () => {
      if (sockRef.current !== sock) return
      sockRef.current = null
      prontoRef.current = false
      setConectando(false)
      setPensando(false)
      // A próxima mensagem abre outra sessão; o assistente não lembra desta.
      tinhaHistoricoRef.current = true
    }
    sock.onerror = () => setErro('Falha na conexão com o assistente.')
    sock.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        tocar(new Uint8Array(ev.data))
        return
      }
      if (typeof ev.data !== 'string') return
      let msg: Msg
      try {
        msg = JSON.parse(ev.data) as Msg
      } catch {
        return
      }
      if (msg.type === 'live') {
        prontoRef.current = true
        setConectando(false)
        for (const texto of filaRef.current.splice(0))
          sock.send(JSON.stringify({ type: 'texto', text: texto }))
      } else if (msg.type === 'assistente' && msg.text) {
        const trecho = msg.text
        const nova = novaRespostaRef.current
        novaRespostaRef.current = false
        setPensando(false)
        setMensagens((lista) => {
          const ultima = lista[lista.length - 1]
          if (!nova && ultima?.papel === 'assistente') {
            return [...lista.slice(0, -1), { ...ultima, texto: ultima.texto + trecho }]
          }
          return [...lista, { id: ++seqRef.current, papel: 'assistente', texto: trecho }]
        })
      } else if (msg.type === 'interrupted') {
        pararSaida()
      } else if (msg.type === 'turn') {
        setPensando(false)
      } else if (msg.type === 'acao') {
        tratarAcao(sock, msg.acao, acaoRef.current)
      } else if (msg.type === 'error') {
        setErro(msg.text || 'Falha no assistente.')
        setPensando(false)
        encerrar()
      }
    }
  }, [encerrar, pararSaida, tocar])

  const enviar = useCallback(
    (texto: string) => {
      const limpo = texto.trim()
      if (!limpo) return
      setErro('')
      // Pergunta nova corta a fala anterior.
      pararSaida()
      prepararAudio()
      novaRespostaRef.current = true
      setPensando(true)
      const reiniciada = tinhaHistoricoRef.current && !sockRef.current
      const idAviso = ++seqRef.current
      const idUsuario = ++seqRef.current
      setMensagens((lista) => [
        ...lista,
        ...(reiniciada
          ? [
              {
                id: idAviso,
                papel: 'sistema' as const,
                texto: 'Conversa reiniciada: o assistente não lembra das mensagens acima.',
              },
            ]
          : []),
        { id: idUsuario, papel: 'usuario' as const, texto: limpo },
      ])
      if (!sockRef.current) {
        filaRef.current.push(limpo)
        conectar()
        tinhaHistoricoRef.current = false
      } else if (prontoRef.current && sockRef.current.readyState === 1) {
        sockRef.current.send(JSON.stringify({ type: 'texto', text: limpo }))
      } else {
        filaRef.current.push(limpo)
      }
    },
    [conectar, pararSaida, prepararAudio],
  )

  /** Manda o snapshot da tela (só com a sessão aberta). */
  const enviarContexto = useCallback((contexto: unknown) => {
    const sock = sockRef.current
    if (sock && sock.readyState === 1 && prontoRef.current)
      sock.send(JSON.stringify({ type: 'contexto', contexto }))
  }, [])

  /** Apaga o histórico e fecha a sessão: a próxima mensagem começa do zero. */
  const novaConversa = useCallback(() => {
    encerrar()
    setMensagens([])
    setErro('')
    tinhaHistoricoRef.current = false
    novaRespostaRef.current = true
  }, [encerrar])

  useEffect(() => encerrar, [encerrar])

  return {
    mensagens,
    pensando,
    conectando,
    erro,
    vozLigada,
    falando,
    definirVoz,
    enviar,
    enviarContexto,
    novaConversa,
    encerrar,
  }
}
