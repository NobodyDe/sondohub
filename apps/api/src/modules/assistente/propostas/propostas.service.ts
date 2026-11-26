import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserDetail, UserRole } from '@sondohub/contracts';
import { UsersRepository } from '../../users/users.repository.js';
import { normalizar } from '../acoes.js';
import { AssistenteRepository } from '../assistente.repository.js';
import type { ContextoTela } from '../contexto.js';
import {
  ADMIN_USERS_WRITER,
  VALIDADE_PROPOSTA_MS,
  type AdminUsersWriter,
  type AssistentePropostaResultado,
  type AssistentePropostaResumo,
  type ExecucaoProposta,
  type PedidoPropostaEscrita,
  type PropostaPendenteInterna,
  type ResultadoCriacaoProposta,
} from './proposta.types.js';

const CARGOS_ROTULO: Record<UserRole, string> = {
  MASTER: 'Master',
  ADMIN: 'Administrador',
  USER: 'Usuário',
};

const PRONOMES_TELA = new Set([
  '',
  'esse',
  'essa',
  'este',
  'esta',
  'ele',
  'ela',
  'atual',
  'tela',
  'esse usuario',
  'esta pessoa',
  'essa pessoa',
]);

function lerCargo(valor: string): UserRole | null {
  const v = normalizar(valor);
  if (v === 'master') return 'MASTER';
  if (v === 'admin' || v === 'administrador' || v === 'administradora') return 'ADMIN';
  if (v === 'user' || v === 'usuario' || v === 'usuaria' || v === 'comum') return 'USER';
  return null;
}

function lerBooleano(valor: string): boolean | null {
  const v = normalizar(valor);
  if (['true', 'sim', 'ligar', 'ativar', 'ativo', 'ativa', 'autorizar', 'autorizado', 'liberar', '1'].includes(v)) {
    return true;
  }
  if (
    ['false', 'nao', 'desligar', 'desativar', 'inativo', 'inativa', 'revogar', 'tirar', 'bloquear', '0'].includes(v)
  ) {
    return false;
  }
  return null;
}

/**
 * Serviço Human-in-the-Loop: prepara propostas de alteração administrativa (sem tocar no banco)
 * e só executa quando o Master confirma clicando no Card de Confirmação no navegador.
 */
@Injectable()
export class AssistentePropostasService {
  private readonly pendentes = new Map<string, PropostaPendenteInterna>();

  constructor(
    private readonly users: UsersRepository,
    @Inject(ADMIN_USERS_WRITER) private readonly adminUsers: AdminUsersWriter,
    private readonly repo: AssistenteRepository,
  ) {}

  private limparExpiradas(agora = Date.now()) {
    for (const [id, p] of this.pendentes) {
      if (p.expiraEmMs <= agora) this.pendentes.delete(id);
    }
  }

  private async resolverUsuarioAlvo(
    termoBruto: string | undefined,
    contexto: ContextoTela | null | undefined,
  ): Promise<AdminUserDetail | string> {
    const termo = (termoBruto ?? '').trim();
    const norm = normalizar(termo);

    if (PRONOMES_TELA.has(norm)) {
      const visto = contexto?.estado?.usuarioVisto as { id?: unknown } | undefined;
      if (typeof visto?.id === 'string' && visto.id) {
        const detalhe = await this.users.findDetail(visto.id);
        if (detalhe) return detalhe;
      }
      return 'Diga o nome ou o e-mail do usuário (ou abra a ficha dele na tela).';
    }

    const pagina = await this.users.listPage({ filter: 'all', q: termo, take: 5 });
    if (pagina.items.length === 0) return `Não encontrei nenhum usuário com "${termo}".`;
    if (pagina.items.length > 1) {
      const nomes = pagina.items.map((u) => `${u.name} (${u.email})`).join(', ');
      return `Encontrei mais de um usuário: ${nomes}. Pergunte qual deles.`;
    }
    const detalhe = await this.users.findDetail(pagina.items[0].id);
    return detalhe ?? `Não encontrei os detalhes de "${termo}".`;
  }

  /** Valida o pedido, resolve nomes em IDs e cria o card de confirmação para o navegador. */
  async criarProposta(
    autorId: string,
    pedido: PedidoPropostaEscrita,
    contexto?: ContextoTela | null,
    agora = Date.now(),
  ): Promise<ResultadoCriacaoProposta> {
    this.limparExpiradas(agora);
    const usuarioOuErro = await this.resolverUsuarioAlvo(pedido.usuario, contexto);
    if (typeof usuarioOuErro === 'string') return { texto: usuarioOuErro };
    const alvo = usuarioOuErro;

    const op = normalizar(pedido.operacao).replace(/\s+/g, '_');
    const montada = this.montarOperacao(autorId, alvo, op, pedido);
    if ('erro' in montada) return { texto: montada.erro };

    const id = randomUUID();
    const expiraEmMs = agora + VALIDADE_PROPOSTA_MS;
    const resumo: AssistentePropostaResumo = {
      id,
      operacao: montada.operacao,
      titulo: montada.titulo,
      descricao: montada.descricao,
      detalhe: montada.detalhe,
      expiraEm: new Date(expiraEmMs).toISOString(),
      usuarioAlvo: { id: alvo.id, nome: alvo.name, email: alvo.email },
    };

    this.pendentes.set(id, { id, autorId, expiraEmMs, resumo, execucao: montada.execucao });

    return {
      texto: `Cartão de confirmação exibido na tela: ${resumo.titulo} para ${alvo.name} (${resumo.detalhe}). Peça para o Master clicar em Confirmar no cartão.`,
      acao: {
        tipo: 'confirmar_escrita',
        descricao: resumo.titulo,
        proposta: resumo,
      },
    };
  }

  private montarOperacao(
    autorId: string,
    alvo: AdminUserDetail,
    op: string,
    pedido: PedidoPropostaEscrita,
  ):
    | { erro: string }
    | {
        operacao: AssistentePropostaResumo['operacao'];
        titulo: string;
        descricao: string;
        detalhe: string;
        execucao: ExecucaoProposta;
      } {
    if (op === 'liberar_app') {
      const buscaApp = normalizar(pedido.app ?? '');
      if (!buscaApp) return { erro: 'Diga qual aplicativo deve ser liberado.' };
      const achados = alvo.apps.filter((a) => normalizar(a.name).includes(buscaApp) || normalizar(a.slug) === buscaApp);
      if (achados.length === 0) {
        return { erro: `Aplicativo "${pedido.app}" não encontrado. Opções: ${alvo.apps.map((a) => a.name).join(', ')}.` };
      }
      if (achados.length > 1) {
        return { erro: `Mais de um aplicativo combina: ${achados.map((a) => a.name).join(', ')}. Pergunte qual.` };
      }
      const [app] = achados;
      const valorBruto = (pedido.valor ?? '').trim();
      const valorNorm = normalizar(valorBruto);
      const nivelEscolhido =
        app.levels.find((l) => String(l.level) === valorNorm || normalizar(l.label) === valorNorm) ??
        (app.levels.length === 1 ? app.levels[0] : undefined);
      if (!nivelEscolhido) {
        const opcoes = app.levels.map((l) => `${l.level} (${l.label})`).join(', ');
        return { erro: `Informe o nível para ${app.name}. Níveis disponíveis: ${opcoes}.` };
      }
      return {
        operacao: 'liberar_app',
        titulo: `Liberar ${app.name}`,
        descricao: app.hasAccess ? 'Alterar nível de acesso ao aplicativo' : 'Conceder acesso ao aplicativo',
        detalhe: `Nível ${nivelEscolhido.level} (${nivelEscolhido.label})`,
        execucao: { tipo: 'liberar_app', userId: alvo.id, slug: app.slug, level: nivelEscolhido.level },
      };
    }

    if (op === 'remover_app') {
      const buscaApp = normalizar(pedido.app ?? '');
      if (!buscaApp) return { erro: 'Diga de qual aplicativo o acesso deve ser removido.' };
      const achados = alvo.apps.filter((a) => normalizar(a.name).includes(buscaApp) || normalizar(a.slug) === buscaApp);
      if (achados.length !== 1) {
        return { erro: `Especifique o aplicativo. Opções: ${alvo.apps.map((a) => a.name).join(', ')}.` };
      }
      const [app] = achados;
      return {
        operacao: 'remover_app',
        titulo: `Remover acesso ao ${app.name}`,
        descricao: 'Revogar acesso do usuário ao aplicativo',
        detalhe: `Aplicativo: ${app.name}`,
        execucao: { tipo: 'remover_app', userId: alvo.id, slug: app.slug },
      };
    }

    if (op === 'autorizar_assistente') {
      const autorizado = lerBooleano(pedido.valor ?? 'sim');
      if (autorizado === null) return { erro: 'Informe se é para autorizar (sim) ou desautorizar (não) o assistente.' };
      return {
        operacao: 'autorizar_assistente',
        titulo: autorizado ? 'Autorizar uso do Assistente' : 'Revogar uso do Assistente',
        descricao: autorizado
          ? 'Liberar o Assistente de IA de voz e chat para este usuário'
          : 'Desligar a permissão de uso do Assistente de IA deste usuário',
        detalhe: autorizado ? 'Permissão: Autorizado' : 'Permissão: Não autorizado',
        execucao: { tipo: 'autorizar_assistente', userId: alvo.id, autorizado },
      };
    }

    if (op === 'alterar_cargo') {
      if (alvo.id === autorId) return { erro: 'Você não pode alterar o próprio cargo.' };
      const cargo = lerCargo(pedido.valor ?? '');
      if (!cargo) return { erro: 'Informe o novo cargo: Usuário, Administrador ou Master.' };
      return {
        operacao: 'alterar_cargo',
        titulo: `Alterar cargo para ${CARGOS_ROTULO[cargo]}`,
        descricao: `Mudar o cargo atual (${CARGOS_ROTULO[alvo.role]}) no SondoHub`,
        detalhe: `Novo cargo: ${CARGOS_ROTULO[cargo]}`,
        execucao: { tipo: 'alterar_cargo', userId: alvo.id, role: cargo },
      };
    }

    if (op === 'alterar_status') {
      if (alvo.id === autorId) return { erro: 'Você não pode desativar a própria conta.' };
      const isActive = lerBooleano(pedido.valor ?? '');
      if (isActive === null) return { erro: 'Informe se é para ativar (sim) ou desativar (não) a conta.' };
      return {
        operacao: 'alterar_status',
        titulo: isActive ? 'Reativar conta de usuário' : 'Desativar conta de usuário',
        descricao: isActive ? 'Permitir que o usuário volte a entrar no SondoHub' : 'Bloquear o login do usuário no SondoHub',
        detalhe: isActive ? 'Novo status: Ativo' : 'Novo status: Desativado',
        execucao: { tipo: 'alterar_status', userId: alvo.id, isActive },
      };
    }

    return {
      erro: 'Operação desconhecida. Use liberar_app, remover_app, autorizar_assistente, alterar_cargo ou alterar_status.',
    };
  }

  /** Executado somente pelo clique HTTP autenticado do Master no botão Confirmar do card. */
  async confirmar(propostaId: string, masterId: string, agora = Date.now()): Promise<AssistentePropostaResultado> {
    this.limparExpiradas(agora);
    const p = this.pendentes.get(propostaId);
    if (!p || p.autorId !== masterId) {
      return { ok: false, mensagem: 'Proposta expirada ou já processada. Peça novamente ao assistente.' };
    }
    this.pendentes.delete(propostaId);

    const { execucao, resumo } = p;
    switch (execucao.tipo) {
      case 'liberar_app':
        await this.adminUsers.setAppLevel(execucao.userId, execucao.slug, execucao.level);
        break;
      case 'remover_app':
        await this.adminUsers.removeApp(execucao.userId, execucao.slug);
        break;
      case 'autorizar_assistente':
        await this.repo.gravarPermissao(execucao.userId, execucao.autorizado, masterId);
        break;
      case 'alterar_cargo':
        await this.adminUsers.update(masterId, execucao.userId, { role: execucao.role });
        break;
      case 'alterar_status':
        await this.adminUsers.update(masterId, execucao.userId, { isActive: execucao.isActive });
        break;
    }

    const mensagem = `Concluído: ${resumo.titulo} (${resumo.usuarioAlvo.nome}).`;
    this.repo.registrarAuditoria({
      userId: masterId,
      ferramenta: 'confirmar_proposta',
      args: { operacao: resumo.operacao, usuario: resumo.usuarioAlvo.email, detalhe: resumo.detalhe },
      resultado: mensagem,
    });

    return { ok: true, mensagem, usuarioId: resumo.usuarioAlvo.id };
  }

  cancelar(propostaId: string, masterId: string): AssistentePropostaResultado {
    const p = this.pendentes.get(propostaId);
    if (p && p.autorId === masterId) {
      this.pendentes.delete(propostaId);
      this.repo.registrarAuditoria({
        userId: masterId,
        ferramenta: 'cancelar_proposta',
        args: { operacao: p.resumo.operacao, usuario: p.resumo.usuarioAlvo.email },
        resultado: 'Cancelada pelo Master.',
      });
    }
    return { ok: true, mensagem: 'Operação cancelada.' };
  }
}
