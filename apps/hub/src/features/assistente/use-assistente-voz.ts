import { useCallback, useEffect, useRef, useState } from "react";
import {
  escolherDispositivo,
  lerPrefAudio,
  listarDispositivosAudio,
  saidaSelecionavel,
  type DispositivoAudio,
} from "./lib/audio-devices.ts";
import { micLiberado, type ModoMic } from "./lib/mic-mode.ts";
import { pcm16ParaFloat, reduzirTaxa, TAXA_ENTRADA, TAXA_SAIDA } from "./lib/pcm.ts";
import { lerAcao, type AcaoAssistente, type ResultadoAcao } from "./executar-acoes.ts";

export type FaseVoz = "idle" | "conectando" | "ouvindo" | "falando";

export type AoReceberAcao = (acao: AcaoAssistente) => ResultadoAcao | void | Promise<ResultadoAcao | void>;

/** Mesmo origin do hub: o cookie de sessão acompanha o upgrade, não há token no quadro. */
export const urlVoz = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/assistente/voz`;

/** Valida a ação recebida, executa no navegador e devolve o `acao_resultado` ao servidor. */
export function tratarAcao(sock: WebSocket, bruto: unknown, executar: AoReceberAcao | undefined) {
  const id = (bruto as { id?: unknown } | undefined)?.id;
  const responder = (r: ResultadoAcao) => {
    if (typeof id === "string" && sock.readyState === 1) sock.send(JSON.stringify({ type: "acao_resultado", id, ...r }));
  };
  const acao = lerAcao(bruto);
  if (!acao) return responder({ ok: false, detalhe: "ação inválida" });
  Promise.resolve()
    .then(() => executar?.(acao))
    .then((r) => responder(r ?? { ok: true }))
    .catch(() => responder({ ok: false, detalhe: "erro ao executar no navegador" }));
}

const WORKLET = `
class MicAssistente extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    let i = 0
    while (i < ch.length) {
      const take = Math.min(ch.length - i, this.buf.length - this.n)
      this.buf.set(ch.subarray(i, i + take), this.n)
      this.n += take; i += take
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0 }
    }
    return true
  }
}
registerProcessor('mic-assistente', MicAssistente)
`;

type Msg = { type?: string; text?: string; acao?: unknown };

export function useAssistenteVoz(
  aoReceberAcao?: AoReceberAcao,
  /** Modo do microfone salvo no banco para este usuário. */
  modoSalvo: ModoMic = "aberto",
  aoMudarModo?: (modo: ModoMic) => void,
) {
  const acaoRef = useRef(aoReceberAcao);
  useEffect(() => {
    acaoRef.current = aoReceberAcao;
  });
  const [fase, setFase] = useState<FaseVoz>("idle");
  const [erro, setErro] = useState("");
  const [legenda, setLegenda] = useState({ usuario: "", assistente: "" });

  const [modo, setModo] = useState<ModoMic>(modoSalvo);
  const [segurando, setSegurando] = useState(false);
  const modoRef = useRef<ModoMic>(modo);
  const aoMudarModoRef = useRef(aoMudarModo);
  useEffect(() => {
    aoMudarModoRef.current = aoMudarModo;
  });
  // O banco manda: quando a config chega ou muda (outro aparelho), o modo acompanha.
  useEffect(() => {
    modoRef.current = modoSalvo;
    setModo(modoSalvo);
  }, [modoSalvo]);
  const segurandoRef = useRef(false);

  const sockRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const noRef = useRef<AudioNode | null>(null);
  const fontesRef = useRef<AudioBufferSourceNode[]>([]);
  const tocaAteRef = useRef(0);
  const novoTurnoRef = useRef({ usuario: true, assistente: true });

  const pararSaida = useCallback(() => {
    for (const f of fontesRef.current) {
      try {
        f.stop();
      } catch {
        /* já terminou */
      }
    }
    fontesRef.current = [];
    tocaAteRef.current = 0;
  }, []);

  const encerrar = useCallback(() => {
    const sock = sockRef.current;
    sockRef.current = null;
    try {
      sock?.close();
    } catch {
      /* ignora */
    }
    try {
      noRef.current?.disconnect();
    } catch {
      /* ignora */
    }
    noRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    pararSaida();
    segurandoRef.current = false;
    setSegurando(false);
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    setFase("idle");
  }, [pararSaida]);

  const tocar = useCallback((bytes: Uint8Array) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const floats = pcm16ParaFloat(bytes);
    if (!floats.length) return;
    const buf = ctx.createBuffer(1, floats.length, TAXA_SAIDA);
    buf.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // Pequena folga na primeira fatia para absorver jitter de rede.
    const inicio = Math.max(tocaAteRef.current, ctx.currentTime + 0.08);
    src.start(inicio);
    tocaAteRef.current = inicio + buf.duration;
    fontesRef.current.push(src);
    src.onended = () => {
      fontesRef.current = fontesRef.current.filter((f) => f !== src);
      if (fontesRef.current.length === 0) setFase((f) => (f === "falando" ? "ouvindo" : f));
    };
    setFase("falando");
  }, []);

  const iniciar = useCallback(async () => {
    if (sockRef.current) return;
    setErro("");
    setLegenda({ usuario: "", assistente: "" });
    novoTurnoRef.current = { usuario: true, assistente: true };
    setFase("conectando");

    async function abrirMic(ctx: AudioContext, sock: WebSocket) {
      const stream = micRef.current;
      if (!stream) return;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const fonte = ctx.createMediaStreamSource(stream);
      const no = new AudioWorkletNode(ctx, "mic-assistente");
      const mudo = ctx.createGain();
      mudo.gain.value = 0;
      no.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (sock.readyState !== 1 || !micLiberado(modoRef.current, segurandoRef.current)) return;
        const pcm = reduzirTaxa(ev.data, ctx.sampleRate, TAXA_ENTRADA);
        if (pcm.length) sock.send(pcm);
      };
      fonte.connect(no);
      no.connect(mudo);
      mudo.connect(ctx.destination);
      noRef.current = no;
      setFase("ouvindo");
    }

    try {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      ctxRef.current = ctx;
      await ctx.resume();
      const pref = lerPrefAudio();
      await aplicarSaida(ctx, pref.saida);
      micRef.current = await abrirMicrofone(pref.entrada);
      const sock = new WebSocket(urlVoz());
      sock.binaryType = "arraybuffer";
      sockRef.current = sock;

      sock.onopen = () => sock.send(JSON.stringify({ type: "auth", canal: "voz" }));
      sock.onclose = () => {
        if (sockRef.current === sock) encerrar();
      };
      sock.onerror = () => setErro("Falha na conexão com o assistente.");
      sock.onmessage = (ev: MessageEvent) => {
        if (ev.data instanceof ArrayBuffer) {
          tocar(new Uint8Array(ev.data));
          return;
        }
        let msg: Msg;
        try {
          msg = JSON.parse(String(ev.data)) as Msg;
        } catch {
          return;
        }
        if (msg.type === "live") void abrirMic(ctx, sock);
        else if (msg.type === "acao") tratarAcao(sock, msg.acao, acaoRef.current);
        else if (msg.type === "interrupted") {
          pararSaida();
          setFase("ouvindo");
        } else if (msg.type === "user" && msg.text) {
          const novo = novoTurnoRef.current.usuario;
          novoTurnoRef.current = { usuario: false, assistente: true };
          setLegenda((l) => ({ usuario: novo ? msg.text! : l.usuario + msg.text!, assistente: novo ? "" : l.assistente }));
        } else if (msg.type === "assistente" && msg.text) {
          const novo = novoTurnoRef.current.assistente;
          novoTurnoRef.current = { ...novoTurnoRef.current, assistente: false };
          setLegenda((l) => ({ ...l, assistente: novo ? msg.text! : l.assistente + msg.text! }));
        } else if (msg.type === "turn") {
          novoTurnoRef.current = { usuario: true, assistente: true };
        } else if (msg.type === "error") {
          setErro(msg.text || "Falha no assistente.");
          encerrar();
        }
      };
    } catch (e) {
      const negado = e instanceof DOMException && e.name === "NotAllowedError";
      setErro(negado ? "Permita o uso do microfone para falar com o assistente." : "Não foi possível iniciar o assistente.");
      encerrar();
    }
  }, [encerrar, pararSaida, tocar]);

  /** Manda o snapshot da tela (só com a sessão aberta). */
  const enviarContexto = useCallback((contexto: unknown) => {
    const sock = sockRef.current;
    if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: "contexto", contexto }));
  }, []);

  const definirModo = useCallback((novo: ModoMic) => {
    modoRef.current = novo;
    setModo(novo);
    aoMudarModoRef.current?.(novo);
    // Trocar de modo no meio da fala não deixa o microfone preso.
    segurandoRef.current = false;
    setSegurando(false);
  }, []);

  /** Modo "apertar": true ao apertar, false ao soltar (avisa o fim da fala). */
  const segurar = useCallback(
    (apertado: boolean) => {
      if (modoRef.current !== "apertar" || !sockRef.current || !noRef.current) return;
      if (segurandoRef.current === apertado) return;
      segurandoRef.current = apertado;
      setSegurando(apertado);
      if (apertado) {
        // Falar por cima corta a resposta que está tocando.
        pararSaida();
        setFase("ouvindo");
      } else if (sockRef.current.readyState === 1) {
        sockRef.current.send(JSON.stringify({ type: "audio_end" }));
      }
    },
    [pararSaida],
  );

  useEffect(() => encerrar, [encerrar]);

  return { fase, erro, legenda, modo, segurando, definirModo, segurar, iniciar, encerrar, enviarContexto };
}

const AUDIO_BASE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** Microfone escolhido nas configurações; se sumiu ou falhou, cai no padrão do sistema. */
async function abrirMicrofone(pref?: DispositivoAudio): Promise<MediaStream> {
  const pedir = (deviceId?: string) =>
    navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...AUDIO_BASE, deviceId: { exact: deviceId } } : AUDIO_BASE });
  if (!pref) return pedir();
  try {
    return await pedir(pref.id);
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotAllowedError") throw e;
  }
  // O id mudou (permissão limpa, outro USB): abre o padrão e tenta achar o aparelho pelo nome.
  const padrao = await pedir();
  try {
    const { entradas } = await listarDispositivosAudio();
    const id = escolherDispositivo(entradas, pref);
    if (id && id !== padrao.getAudioTracks()[0]?.getSettings().deviceId) {
      const melhor = await pedir(id);
      padrao.getTracks().forEach((t) => t.stop());
      return melhor;
    }
  } catch {
    /* fica no padrão */
  }
  return padrao;
}

/** Saída escolhida (só onde o navegador deixa); falhou, segue na saída do sistema. */
export async function aplicarSaida(ctx: AudioContext, pref?: DispositivoAudio) {
  if (!pref || !saidaSelecionavel()) return;
  try {
    const { saidas } = await listarDispositivosAudio();
    const id = escolherDispositivo(saidas, pref);
    if (id) await (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(id);
  } catch {
    /* saída padrão */
  }
}
