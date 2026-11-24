import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { criptografar, descriptografar } from './cripto.js';
import { MAX_MEMORIAS, type EntradaMemoria, type Memoria } from './memorias.js';
import { MAX_PERGUNTAS, type EntradaPergunta, type Pergunta } from './perguntas.js';
import { MAX_REGRAS, type EntradaRegra, type Regra } from './regras.js';
import {
  MODOS_MIC,
  PREFERENCIAS,
  normalizarVoz,
  preferenciaEfetiva,
  type AlteracaoConfig,
  type ConfigAssistente,
  type ModoMic,
  type PreferenciaAssistente,
} from './tipos.js';

export const RETENCAO_AUDITORIA_DIAS = 90;

/** Quem é o dono das regras: o id de um usuário (regras pessoais) ou `null` (regras da empresa, do Master). */
export type EscopoRegra = string | null;

const normalizarModo = (v: unknown): ModoMic =>
  (MODOS_MIC as readonly string[]).includes(v as string) ? (v as ModoMic) : 'aberto';
const normalizarPreferencia = (v: unknown): PreferenciaAssistente =>
  (PREFERENCIAS as readonly string[]).includes(v as string) ? (v as PreferenciaAssistente) : 'voz';

export const resumir = (v: unknown, max = 300) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v ?? '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

const regraSelect = { id: true, nome: true, texto: true, ativo: true, bloqueia: true } as const;
const paraRegra = (r: Prisma.AssistenteRegraGetPayload<{ select: typeof regraSelect }>): Regra => ({
  ...r,
  bloqueia: Array.isArray(r.bloqueia) ? (r.bloqueia as string[]) : [],
});

const memoriaSelect = { id: true, texto: true, origem: true, ativo: true } as const;
const paraMemoria = (m: Prisma.AssistenteMemoriaGetPayload<{ select: typeof memoriaSelect }>): Memoria => ({
  ...m,
  origem: m.origem === 'assistente' ? 'assistente' : 'usuario',
});

const perguntaSelect = { id: true, texto: true, ativo: true } as const;

@Injectable()
export class AssistenteRepository {
  private readonly logger = new Logger('Assistente');

  constructor(private readonly prisma: PrismaService) {}

  // ── Chaves do Gemini ──────────────────────────────────────────────────────

  async temChaveGlobal(): Promise<boolean> {
    const linha = await this.prisma.assistenteConfig.findUnique({ where: { id: 1 }, select: { apiKeyEnc: true } });
    return Boolean(linha?.apiKeyEnc);
  }

  /** Só o servidor e o Master (para copiar) leem a chave global. */
  async lerChaveGlobal(): Promise<string | null> {
    const linha = await this.prisma.assistenteConfig.findUnique({ where: { id: 1 }, select: { apiKeyEnc: true } });
    return linha?.apiKeyEnc ? descriptografar(linha.apiKeyEnc) : null;
  }

  /** `''` remove a chave global. */
  async gravarChaveGlobal(apiKey: string, porId: string): Promise<void> {
    const apiKeyEnc = apiKey ? criptografar(apiKey) : null;
    await this.prisma.assistenteConfig.upsert({
      where: { id: 1 },
      create: { id: 1, apiKeyEnc, updatedBy: porId },
      update: { apiKeyEnc, updatedBy: porId, updatedAt: new Date() },
    });
  }

  async temChavePropria(userId: string): Promise<boolean> {
    return (await this.prisma.assistenteChaveUsuario.count({ where: { userId } })) > 0;
  }

  /** Chave própria (só o dono a lê, para copiar). */
  async lerChavePropria(userId: string): Promise<string | null> {
    const linha = await this.prisma.assistenteChaveUsuario.findUnique({ where: { userId }, select: { apiKeyEnc: true } });
    return linha ? descriptografar(linha.apiKeyEnc) : null;
  }

  /** `''` remove a chave própria. */
  async gravarChavePropria(userId: string, apiKey: string): Promise<void> {
    if (!apiKey) {
      await this.prisma.assistenteChaveUsuario.deleteMany({ where: { userId } });
      return;
    }
    const apiKeyEnc = criptografar(apiKey);
    await this.prisma.assistenteChaveUsuario.upsert({
      where: { userId },
      create: { userId, apiKeyEnc },
      update: { apiKeyEnc, updatedAt: new Date() },
    });
  }

  /** A chave que a sessão usa: a do próprio usuário, se houver; senão a da empresa. */
  async resolverChave(userId: string): Promise<string | null> {
    return (await this.lerChavePropria(userId)) ?? (await this.lerChaveGlobal());
  }

  // ── Preferências ──────────────────────────────────────────────────────────

  async lerConfigUsuario(userId: string): Promise<ConfigAssistente> {
    const [linha, chaveConfigurada] = await Promise.all([
      this.prisma.assistentePreferencias.findUnique({ where: { userId } }),
      this.temChaveGlobal(),
    ]);
    const chatTexto = linha?.chatTexto ?? true;
    return {
      habilitado: linha?.habilitado ?? false,
      voz: normalizarVoz(linha?.voz),
      internet: linha?.internet ?? false,
      nome: linha?.nome ?? '',
      apelido: linha?.apelido ?? '',
      modoMic: normalizarModo(linha?.modoMic),
      chatTexto,
      preferencia: preferenciaEfetiva(chatTexto, normalizarPreferencia(linha?.preferencia)),
      chaveConfigurada,
    };
  }

  /** Grava só o que veio; o resto continua como estava. */
  async gravarPreferencias(userId: string, a: AlteracaoConfig): Promise<ConfigAssistente> {
    const dados = {
      habilitado: a.habilitado,
      voz: a.voz,
      internet: a.internet,
      nome: a.nome,
      apelido: a.apelido,
      modoMic: a.modoMic,
      chatTexto: a.chatTexto,
      // Guarda a escolha do usuário, não a efetiva: desligar o chat não apaga a preferência.
      preferencia: a.preferencia,
    };
    await this.prisma.assistentePreferencias.upsert({
      where: { userId },
      create: { userId, ...dados },
      update: { ...dados, updatedAt: new Date() },
    });
    return this.lerConfigUsuario(userId);
  }

  // ── Permissão (o Master libera cada pessoa) ───────────────────────────────

  /** O Master sempre pode; os demais, só com o switch ligado. Usuário inativo nunca. */
  async usuarioPodeUsar(user: { id: string; role: string; isActive: boolean }): Promise<boolean> {
    if (!user.isActive) return false;
    if (user.role === 'MASTER') return true;
    return this.lerPermissao(user.id);
  }

  async lerPermissao(userId: string): Promise<boolean> {
    const linha = await this.prisma.assistentePermissao.findUnique({ where: { userId }, select: { autorizado: true } });
    return linha?.autorizado ?? false;
  }

  async gravarPermissao(userId: string, autorizado: boolean, porId: string): Promise<void> {
    await this.prisma.assistentePermissao.upsert({
      where: { userId },
      create: { userId, autorizado, updatedBy: porId },
      update: { autorizado, updatedBy: porId, updatedAt: new Date() },
    });
  }

  // ── Regras ────────────────────────────────────────────────────────────────

  async listarRegras(escopo: EscopoRegra): Promise<Regra[]> {
    const linhas = await this.prisma.assistenteRegra.findMany({
      where: { userId: escopo },
      select: regraSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return linhas.map(paraRegra);
  }

  async criarRegra(escopo: EscopoRegra, autorId: string, e: EntradaRegra): Promise<Regra> {
    if ((await this.prisma.assistenteRegra.count({ where: { userId: escopo } })) >= MAX_REGRAS) {
      throw new UnprocessableEntityException(`Limite de ${MAX_REGRAS} regras.`);
    }
    const criada = await this.prisma.assistenteRegra.create({
      data: {
        userId: escopo,
        nome: e.nome!,
        texto: e.texto!,
        ativo: e.ativo ?? true,
        bloqueia: e.bloqueia ?? [],
        updatedBy: autorId,
      },
      select: regraSelect,
    });
    return paraRegra(criada);
  }

  async editarRegra(escopo: EscopoRegra, autorId: string, id: string, e: EntradaRegra): Promise<Regra> {
    const { count } = await this.prisma.assistenteRegra.updateMany({
      where: { id, userId: escopo },
      data: { nome: e.nome, texto: e.texto, ativo: e.ativo, bloqueia: e.bloqueia, updatedBy: autorId, updatedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Regra não encontrada.');
    return paraRegra(await this.prisma.assistenteRegra.findUniqueOrThrow({ where: { id }, select: regraSelect }));
  }

  async removerRegra(escopo: EscopoRegra, id: string): Promise<void> {
    const { count } = await this.prisma.assistenteRegra.deleteMany({ where: { id, userId: escopo } });
    if (count === 0) throw new NotFoundException('Regra não encontrada.');
  }

  // ── Memórias ──────────────────────────────────────────────────────────────

  async listarMemorias(userId: string): Promise<Memoria[]> {
    const linhas = await this.prisma.assistenteMemoria.findMany({
      where: { userId },
      select: memoriaSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return linhas.map(paraMemoria);
  }

  async criarMemoria(userId: string, texto: string, origem: Memoria['origem'] = 'usuario'): Promise<Memoria> {
    if ((await this.prisma.assistenteMemoria.count({ where: { userId } })) >= MAX_MEMORIAS) {
      throw new UnprocessableEntityException(`Limite de ${MAX_MEMORIAS} memórias.`);
    }
    return paraMemoria(await this.prisma.assistenteMemoria.create({ data: { userId, texto, origem }, select: memoriaSelect }));
  }

  async editarMemoria(userId: string, id: string, e: EntradaMemoria): Promise<Memoria> {
    const { count } = await this.prisma.assistenteMemoria.updateMany({
      where: { id, userId },
      data: { texto: e.texto, ativo: e.ativo, updatedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Memória não encontrada.');
    return paraMemoria(await this.prisma.assistenteMemoria.findUniqueOrThrow({ where: { id }, select: memoriaSelect }));
  }

  async removerMemoria(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.assistenteMemoria.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Memória não encontrada.');
  }

  /** Apaga as memórias do usuário que contêm o trecho (sem caixa). Devolve quantas. */
  async esquecerMemorias(userId: string, trecho: string): Promise<number> {
    const limpo = trecho.trim();
    if (!limpo) return 0;
    const { count } = await this.prisma.assistenteMemoria.deleteMany({
      where: { userId, texto: { contains: limpo, mode: 'insensitive' } },
    });
    return count;
  }

  // ── Perguntas rápidas ─────────────────────────────────────────────────────

  listarPerguntas(userId: string): Promise<Pergunta[]> {
    return this.prisma.assistentePergunta.findMany({
      where: { userId },
      select: perguntaSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async criarPergunta(userId: string, texto: string): Promise<Pergunta> {
    if ((await this.prisma.assistentePergunta.count({ where: { userId } })) >= MAX_PERGUNTAS) {
      throw new UnprocessableEntityException(`Limite de ${MAX_PERGUNTAS} perguntas.`);
    }
    return this.prisma.assistentePergunta.create({ data: { userId, texto }, select: perguntaSelect });
  }

  async editarPergunta(userId: string, id: string, e: EntradaPergunta): Promise<Pergunta> {
    const { count } = await this.prisma.assistentePergunta.updateMany({
      where: { id, userId },
      data: { texto: e.texto, ativo: e.ativo, updatedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Pergunta não encontrada.');
    return this.prisma.assistentePergunta.findUniqueOrThrow({ where: { id }, select: perguntaSelect });
  }

  async removerPergunta(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.assistentePergunta.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Pergunta não encontrada.');
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────

  /** Grava sem bloquear nem derrubar a conversa. */
  registrarAuditoria(e: { userId: string; ferramenta: string; args?: unknown; resultado?: string; bloqueada?: boolean }): void {
    void this.prisma.assistenteAuditoria
      .create({
        data: {
          userId: e.userId,
          ferramenta: e.ferramenta.slice(0, 60),
          argumentos: resumir(e.args),
          resultado: resumir(e.resultado ?? ''),
          bloqueada: e.bloqueada === true,
        },
      })
      .catch((error: Error) => this.logger.warn(`falha ao auditar: ${error.message}`));
  }

  async listarAuditoria(limite = 100) {
    await this.prisma.assistenteAuditoria
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENCAO_AUDITORIA_DIAS * 86_400_000) } } })
      .catch(() => undefined);
    const linhas = await this.prisma.assistenteAuditoria.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limite, 1), 500),
      include: { user: { select: { name: true } } },
    });
    return linhas.map((l) => ({
      id: String(l.id),
      usuarioNome: l.user.name,
      ferramenta: l.ferramenta,
      argumentos: l.argumentos,
      resultado: l.resultado,
      bloqueada: l.bloqueada,
      createdAt: l.createdAt.toISOString(),
    }));
  }
}
