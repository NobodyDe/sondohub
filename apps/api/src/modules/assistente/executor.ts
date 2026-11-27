import { HttpException, Injectable, Optional } from '@nestjs/common';
import type { SafeUser } from '../users/users.repository.js';
import { resolverAcao, type AcaoCliente } from './acoes.js';
import { AssistenteRepository } from './assistente.repository.js';
import { pesquisarWeb } from './busca.js';
import { previsaoDoTempo } from './clima.js';
import { AssistenteConsultas } from './consultas.js';
import type { ContextoTela } from './contexto.js';
import { AssistenteFederacaoService } from './federacao/federacao.service.js';
import {
  FERRAMENTA_ACAO,
  FERRAMENTA_BUSCA,
  FERRAMENTA_BUSCAR_USUARIOS,
  FERRAMENTA_CLIMA,
  FERRAMENTA_CONSULTAR_APP_FILHO,
  FERRAMENTA_DETALHE_USUARIO,
  FERRAMENTA_ESQUECER,
  FERRAMENTA_LEMBRAR,
  FERRAMENTA_LISTAR_MEMORIAS,
  FERRAMENTA_MEU_PERFIL,
  FERRAMENTA_MEUS_APPS,
  FERRAMENTA_PAINEL,
  FERRAMENTA_PROPOR_ALTERACAO,
  FERRAMENTA_RESUMO_USUARIOS,
  FERRAMENTA_VER_TELA,
  NOMES_SO_MASTER,
} from './ferramentas.js';
import { MAX_TEXTO_MEMORIA, textoListaMemorias } from './memorias.js';
import { AssistentePropostasService } from './propostas/propostas.service.js';

export type ResultadoAck = { ok: boolean; detalhe?: string };

export type ContextoFerramentas = {
  user: SafeUser;
  chaveGemini: string;
  internet: boolean;
  /** Entrega ao navegador uma ação de tela e espera o ack (`ok: false` = falhou ou sem resposta). */
  emitir?: (acao: AcaoCliente) => Promise<ResultadoAck>;
  /** Último snapshot da tela enviado pelo navegador. */
  contexto?: () => ContextoTela | null;
  /** Ferramentas recusadas por regra ativa (global ou pessoal). */
  bloqueadas?: ReadonlySet<string>;
};

const texto = (args: Record<string, unknown> | undefined, campo: string) => {
  const v = args?.[campo];
  return typeof v === 'string' ? v : '';
};

const NEGADA_REGRA =
  'Essa ferramenta está bloqueada por uma regra. Recuse em uma frase curta e não use outro caminho para o mesmo pedido.';
const NEGADA_PAPEL = 'Essa informação é só para o Master. Diga isso à pessoa em uma frase.';

/** Entrega a ação e acrescenta ao texto o que o navegador de fato fez. */
async function entregar(ctx: ContextoFerramentas, r: { texto: string; acao?: AcaoCliente }): Promise<string> {
  if (!r.acao || !ctx.emitir) return r.texto;
  const ack = await ctx.emitir(r.acao);
  if (ack.ok) return ack.detalhe ? `${r.texto} (${ack.detalhe})` : r.texto;
  return `Não deu certo na tela: ${ack.detalhe ?? 'o navegador não confirmou'}. Diga isso à pessoa, sem afirmar que foi feito.`;
}

@Injectable()
export class AssistenteExecutor {
  constructor(
    private readonly repo: AssistenteRepository,
    private readonly consultas: AssistenteConsultas,
    @Optional() private readonly propostas?: AssistentePropostasService,
    @Optional() private readonly federacao?: AssistenteFederacaoService,
  ) {}

  /** Roda uma chamada de ferramenta e devolve o texto para o modelo. Nunca lança. */
  async executar(
    nome: string | undefined,
    args: Record<string, unknown> | undefined,
    ctx: ContextoFerramentas,
  ): Promise<string> {
    const bloqueada = !!nome && ctx.bloqueadas?.has(nome) === true;
    // O papel é conferido aqui, no servidor: esconder a ferramenta do catálogo não basta.
    const semPapel = !!nome && NOMES_SO_MASTER.has(nome) && ctx.user.role !== 'MASTER';
    const resultado = bloqueada ? NEGADA_REGRA : semPapel ? NEGADA_PAPEL : await this.rodar(nome, args, ctx);
    this.repo.registrarAuditoria({
      userId: ctx.user.id,
      ferramenta: nome ?? '?',
      args,
      resultado,
      bloqueada: bloqueada || semPapel,
    });
    return resultado;
  }

  private async rodar(
    nome: string | undefined,
    args: Record<string, unknown> | undefined,
    ctx: ContextoFerramentas,
  ): Promise<string> {
    const { user } = ctx;
    try {
      switch (nome) {
        case FERRAMENTA_MEUS_APPS.name:
          return await this.consultas.meusApps(user.id);
        case FERRAMENTA_MEU_PERFIL.name:
          return await this.consultas.meuPerfil(user);
        case FERRAMENTA_CONSULTAR_APP_FILHO.name:
          return this.federacao
            ? await this.federacao.consultarAppFilho(user, {
                app: texto(args, 'app'),
                consulta: texto(args, 'consulta'),
              })
            : 'A consulta federada entre aplicativos não está habilitada.';
        case FERRAMENTA_PAINEL.name:
          return await this.consultas.resumoPainel(texto(args, 'periodo'));
        case FERRAMENTA_RESUMO_USUARIOS.name:
          return await this.consultas.resumoUsuarios();
        case FERRAMENTA_BUSCAR_USUARIOS.name:
          return await this.consultas.buscarUsuarios(texto(args, 'busca'));
        case FERRAMENTA_DETALHE_USUARIO.name:
          return await this.consultas.detalheUsuario(texto(args, 'busca'));
        case FERRAMENTA_PROPOR_ALTERACAO.name: {
          if (!this.propostas) return 'O módulo de propostas não está disponível.';
          const r = await this.propostas.criarProposta(
            user.id,
            {
              operacao: texto(args, 'operacao'),
              usuario: texto(args, 'usuario'),
              app: texto(args, 'app'),
              valor: texto(args, 'valor'),
            },
            ctx.contexto?.(),
          );
          return await entregar(ctx, r);
        }
        case FERRAMENTA_ACAO.name: {
          const apps = await this.consultas.appsDaPessoa(user.id);
          const r = resolverAcao(
            { acao: texto(args, 'acao'), tela: texto(args, 'tela'), app: texto(args, 'app') },
            apps,
            user.role === 'MASTER',
          );
          return await entregar(ctx, r);
        }
        case FERRAMENTA_VER_TELA.name: {
          const c = ctx.contexto?.();
          return c ? JSON.stringify(c) : 'O navegador ainda não informou a tela. Peça para a pessoa descrever o que vê.';
        }
        case FERRAMENTA_LEMBRAR.name: {
          const t = texto(args, 'texto').trim().slice(0, MAX_TEXTO_MEMORIA);
          if (!t) return 'Nada para guardar.';
          await this.repo.criarMemoria(user.id, t, 'assistente');
          return 'Guardado.';
        }
        case FERRAMENTA_ESQUECER.name: {
          const n = await this.repo.esquecerMemorias(user.id, texto(args, 'trecho'));
          if (n > 0) return `Esqueci ${n} memória(s).`;
          const atuais = await this.repo.listarMemorias(user.id);
          return `Não achei memória com esse trecho. Memórias atuais:\n${textoListaMemorias(atuais)}\nTente de novo com um trecho exato de uma delas.`;
        }
        case FERRAMENTA_LISTAR_MEMORIAS.name:
          return textoListaMemorias(await this.repo.listarMemorias(user.id));
        case FERRAMENTA_BUSCA.name:
          return ctx.internet ? await pesquisarWeb(texto(args, 'consulta'), ctx.chaveGemini) : 'Internet desligada.';
        case FERRAMENTA_CLIMA.name:
          return ctx.internet ? await previsaoDoTempo(texto(args, 'cidade')) : 'Internet desligada.';
        default:
          return 'Ferramenta desconhecida.';
      }
    } catch (error) {
      // Limite de memórias e afins: a mensagem já é para a pessoa.
      if (error instanceof HttpException && error.getStatus() === 422) return error.message;
      return 'Não consegui obter essa informação agora.';
    }
  }
}
