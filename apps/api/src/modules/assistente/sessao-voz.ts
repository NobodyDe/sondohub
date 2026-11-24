import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';
import { Logger } from '@nestjs/common';
import type { RawData, WebSocket } from 'ws';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { env } from '../../config/env.js';
import type { AcaoCliente } from './acoes.js';
import type { AssistenteRepository } from './assistente.repository.js';
import { ferramentasDaSessao } from './catalogo.js';
import { lerContextoTela, type ContextoTela } from './contexto.js';
import type { AssistenteExecutor, ContextoFerramentas, ResultadoAck } from './executor.js';
import { renderizarMemorias } from './memorias.js';
import { promptSistema } from './prompt.js';
import { carimbarRegras, ferramentasBloqueadas, renderizarRegras } from './regras.js';

const logger = new Logger('AssistenteVoz');

const MIC_MIME = 'audio/pcm;rate=16000';
const PRAZO_AUTH_MS = 10_000;
const PRAZO_ACK_MS = 4_000;

function enviarJson(ws: WebSocket, payload: object) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function textoDe(dados: RawData): string {
  return Buffer.isBuffer(dados) ? dados.toString('utf8') : Buffer.concat(dados as Buffer[]).toString('utf8');
}

export type DepsSessao = { repo: AssistenteRepository; executor: AssistenteExecutor };

/**
 * Uma sessão de voz. O usuário já foi autenticado pelo cookie no upgrade (veja o gateway); aqui o primeiro
 * quadro `auth` só diz o canal. Abre o Gemini Live e repassa áudio, legendas e ações nos dois sentidos.
 * `aoEncerrar` avisa o gateway (contagem de sessões por usuário).
 */
export function atenderVoz(ws: WebSocket, auth: AuthContext, { repo, executor }: DepsSessao, aoEncerrar: () => void) {
  const { user } = auth;
  // 'texto': chat digitado. Sem microfone; a resposta vem em texto (legendas) e em áudio, que o navegador pode silenciar.
  let canal: 'voz' | 'texto' = 'voz';
  let sessao: Session | null = null;
  let encerrado = false;
  let iniciado = false;
  let ctxFerramentas: ContextoFerramentas | null = null;
  let regrasSessao = '';
  let contextoTela: ContextoTela | null = null;
  let seqAcao = 0;
  const aguardando = new Map<string, (r: ResultadoAck) => void>();

  /** Envia a ação com id e espera o `acao_resultado` do navegador (ou o prazo). */
  const emitirComAck = (acao: AcaoCliente): Promise<ResultadoAck> =>
    new Promise((resolver) => {
      const id = `a${++seqAcao}`;
      const t = setTimeout(() => {
        aguardando.delete(id);
        resolver({ ok: false, detalhe: 'sem resposta do navegador' });
      }, PRAZO_ACK_MS);
      aguardando.set(id, (r) => {
        clearTimeout(t);
        aguardando.delete(id);
        resolver(r);
      });
      enviarJson(ws, { type: 'acao', acao: { ...acao, id } });
    });

  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    aoEncerrar();
    for (const r of aguardando.values()) r({ ok: false, detalhe: 'sessão encerrada' });
    clearTimeout(prazo);
    try {
      sessao?.close();
    } catch {
      /* já fechada */
    }
    if (ws.readyState <= 1) ws.close();
  };

  const prazo = setTimeout(() => {
    if (!iniciado) {
      enviarJson(ws, { type: 'error', text: 'Início da sessão não recebido.' });
      encerrar();
    }
  }, PRAZO_AUTH_MS);

  async function iniciar(canalBruto: unknown) {
    canal = canalBruto === 'texto' ? 'texto' : 'voz';
    iniciado = true;

    if (!(await repo.usuarioPodeUsar(user).catch(() => false))) {
      enviarJson(ws, { type: 'error', text: 'O assistente não está liberado para o seu usuário.' });
      encerrar();
      return;
    }
    const config = await repo.lerConfigUsuario(user.id).catch(() => null);
    const chave = config?.habilitado ? await repo.resolverChave(user.id).catch(() => null) : null;
    if (!config || !chave) {
      enviarJson(ws, { type: 'error', text: 'O assistente está desabilitado.' });
      encerrar();
      return;
    }
    if (canal === 'texto' && !config.chatTexto) {
      enviarJson(ws, { type: 'error', text: 'O chat de texto está desabilitado.' });
      encerrar();
      return;
    }
    const master = user.role === 'MASTER';
    const regrasPessoais = await repo.listarRegras(user.id).catch(() => []);
    const regrasGlobais = await repo.listarRegras(null).catch(() => []);
    ctxFerramentas = {
      user,
      chaveGemini: chave,
      internet: config.internet,
      emitir: emitirComAck,
      contexto: () => contextoTela,
      bloqueadas: ferramentasBloqueadas(regrasPessoais, regrasGlobais),
    };
    const regrasTexto = renderizarRegras(regrasPessoais, regrasGlobais);
    regrasSessao = regrasTexto;
    const apelido = config.apelido || (user.name.split(' ')[0] ?? '');
    const memoriasTexto = renderizarMemorias(await repo.listarMemorias(user.id).catch(() => []), apelido);
    enviarJson(ws, { type: 'ready' });

    try {
      const ai = new GoogleGenAI({ apiKey: chave, httpOptions: { apiVersion: 'v1beta' } });
      sessao = await ai.live.connect({
        model: env.GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: promptSistema({
            nome: apelido,
            nomeAssistente: config.nome,
            internet: config.internet,
            master,
            regras: regrasTexto,
            memorias: memoriasTexto,
            canal,
          }),
          tools: [{ functionDeclarations: ferramentasDaSessao({ internet: config.internet, master }) }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voz } } },
        },
        callbacks: {
          onmessage: (msg: LiveServerMessage) => aoReceber(msg),
          onerror: (e) => {
            logger.error(`erro Gemini Live: ${e?.message}`);
            enviarJson(ws, { type: 'error', text: 'Falha na conexão com o assistente.' });
          },
          onclose: () => encerrar(),
        },
      });
      if (encerrado) {
        sessao.close();
        return;
      }
      enviarJson(ws, { type: 'live' });
    } catch (error) {
      logger.error(`não abriu o Gemini Live: ${(error as Error).message}`);
      enviarJson(ws, { type: 'error', text: 'Não foi possível iniciar o assistente.' });
      encerrar();
    }
  }

  async function executarFerramentas(chamadas: FunctionCall[]) {
    const ctx = ctxFerramentas;
    if (!ctx) return;
    const respostas = await Promise.all(
      chamadas.map(async (c) => {
        const resultado = await executor.executar(c.name, c.args, ctx);
        return { id: c.id, name: c.name, response: { result: carimbarRegras(resultado, regrasSessao) } };
      }),
    );
    if (!encerrado) sessao?.sendToolResponse({ functionResponses: respostas });
  }

  function aoReceber(msg: LiveServerMessage) {
    const chamadas = msg.toolCall?.functionCalls;
    if (chamadas?.length) void executarFerramentas(chamadas);
    if (msg.data && ws.readyState === 1) ws.send(Buffer.from(msg.data, 'base64'));
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) enviarJson(ws, { type: 'interrupted' });
    const falaUsuario = sc.inputTranscription?.text;
    if (falaUsuario) enviarJson(ws, { type: 'user', text: falaUsuario });
    const falaModelo = sc.outputTranscription?.text;
    if (falaModelo) enviarJson(ws, { type: 'assistente', text: falaModelo });
    if (sc.turnComplete) enviarJson(ws, { type: 'turn' });
  }

  ws.on('message', (dados, binario) => {
    if (encerrado) return;
    if (binario) {
      if (!sessao || canal === 'texto') return;
      const pcm = Buffer.isBuffer(dados) ? dados : Buffer.concat(dados as Buffer[]);
      try {
        sessao.sendRealtimeInput({ audio: { data: pcm.toString('base64'), mimeType: MIC_MIME } });
      } catch (error) {
        logger.warn(`falha ao enviar áudio: ${(error as Error).message}`);
      }
      return;
    }
    try {
      const m = JSON.parse(textoDe(dados)) as {
        type?: string;
        contexto?: unknown;
        id?: unknown;
        ok?: unknown;
        detalhe?: unknown;
        canal?: unknown;
        text?: unknown;
      };
      if (iniciado) {
        if (m.type === 'texto') {
          // Chat digitado: vai ao Gemini como entrada de texto (limite para não estourar o contexto).
          const texto = typeof m.text === 'string' ? m.text.trim().slice(0, 2000) : '';
          if (texto && canal === 'texto') sessao?.sendRealtimeInput({ text: texto });
          return;
        }
        if (m.type === 'contexto') {
          const c = lerContextoTela(m.contexto);
          if (c) contextoTela = c;
          return;
        }
        if (m.type === 'acao_resultado' && typeof m.id === 'string') {
          aguardando.get(m.id)?.({
            ok: m.ok === true,
            detalhe: typeof m.detalhe === 'string' ? m.detalhe.slice(0, 200) : undefined,
          });
          return;
        }
        // Modo "apertar para falar": o cliente avisa que a fala acabou.
        if (m.type === 'audio_end' && sessao) sessao.sendRealtimeInput({ audioStreamEnd: true });
        return;
      }
      if (m.type === 'auth') void iniciar(m.canal);
    } catch {
      /* ignora quadro inválido */
    }
  });
  ws.on('close', encerrar);
  ws.on('error', encerrar);
}
