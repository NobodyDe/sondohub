import { Injectable } from '@nestjs/common';
import {
  dashboardPeriodSchema,
  type AdminDashboard,
  type AdminUser,
  type AdminUserDetail,
  type DashboardPeriod,
  type UserRole,
} from '@sondohub/contracts';
import type { SafeUser } from '../users/users.repository.js';
import { AppsRepository } from '../apps/apps.repository.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersRepository } from '../users/users.repository.js';

const CARGOS: Record<UserRole, string> = { MASTER: 'Master', ADMIN: 'Administrador', USER: 'Usuário' };
const MAX_ITENS = 5;
const PERIODOS: Record<DashboardPeriod, string> = {
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
  '90d': 'últimos 90 dias',
  '12m': 'últimos 12 meses',
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ── Texto pronto para falar (puro, com teste). O modelo não faz conta. ───────

export type AppDaPessoa = { name: string; description: string; level: number; levelLabel?: string };

export function textoMeusApps(apps: AppDaPessoa[]): string {
  if (apps.length === 0) return 'A pessoa ainda não tem acesso a nenhum aplicativo.';
  const linhas = apps.map((a) => `${a.name} (nível ${a.levelLabel ?? a.level}): ${a.description}`);
  return `${plural(apps.length, 'aplicativo', 'aplicativos')}:\n${linhas.join('\n')}`;
}

export function textoPerfil(
  user: Pick<SafeUser, 'name' | 'email' | 'role'>,
  dispositivos: { userAgent: string | null; createdAt: Date }[],
): string {
  return [
    `Nome: ${user.name}. E-mail: ${user.email}. Cargo: ${CARGOS[user.role]}.`,
    `Conectado em ${plural(dispositivos.length, 'dispositivo', 'dispositivos')} agora.`,
  ].join('\n');
}

/** Variação contra o período anterior, em texto. */
function variacao(atual: number, anterior: number): string {
  if (anterior === 0) return atual === 0 ? 'sem variação' : 'sem base de comparação';
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return 'igual ao período anterior';
  return `${Math.abs(pct)} por cento ${pct > 0 ? 'a mais' : 'a menos'} que o período anterior`;
}

export function textoPainel(d: AdminDashboard): string {
  const mais = [...d.appUsage].sort((a, b) => b.opens - a.opens).slice(0, 3);
  return [
    `Painel dos ${PERIODOS[d.period]}.`,
    `Usuários: ${d.users.active} ativos de ${d.users.total} no total.`,
    `Logins: ${d.logins.total} (${variacao(d.logins.total, d.logins.previous)}).`,
    `Sessões abertas agora: ${d.sessions.open}, de ${plural(d.sessions.people, 'pessoa', 'pessoas')} (${d.sessions.desktop} no computador, ${d.sessions.mobile} no celular).`,
    `Já entraram alguma vez: ${d.activation.everLoggedIn} de ${d.activation.total}.`,
    mais.length
      ? `Aplicativos mais abertos: ${mais.map((a) => `${a.name} (${a.opens})`).join(', ')}.`
      : 'Nenhum aplicativo foi aberto no período.',
    `Atenção: ${d.attention.inactive30d} sem entrar há 30 dias, ${d.attention.withoutApps} sem nenhum aplicativo, ${d.attention.deactivated} desativados.`,
  ].join('\n');
}

export function textoUsuarios(itens: AdminUser[], temMais: boolean): string {
  if (itens.length === 0) return 'Não achei nenhum usuário com essa busca.';
  const linhas = itens.map((u) => {
    const apps = u.apps.length ? u.apps.map((a) => a.name).join(', ') : 'nenhum aplicativo';
    return `${u.name} (${CARGOS[u.role]}${u.isActive ? '' : ', desativado'}), ${u.email}: ${apps}.`;
  });
  return `${linhas.join('\n')}${temMais ? '\nHá mais resultados: peça para refinar a busca.' : ''}`;
}

export function textoDetalheUsuario(u: AdminUserDetail): string {
  const com = u.apps.filter((a) => a.hasAccess);
  const nivel = (a: AdminUserDetail['apps'][number]) => a.levels.find((l) => l.level === a.level)?.label ?? a.level;
  return [
    `${u.name}, ${CARGOS[u.role]}, ${u.isActive ? 'ativo' : 'desativado'}. E-mail: ${u.email}.`,
    com.length
      ? `Aplicativos: ${com.map((a) => `${a.name} (nível ${nivel(a)})`).join(', ')}.`
      : 'Não tem acesso a nenhum aplicativo.',
  ].join('\n');
}

// ── Consultas: chamam os mesmos serviços das telas ──────────────────────────

@Injectable()
export class AssistenteConsultas {
  constructor(
    private readonly apps: AppsRepository,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly dashboard: DashboardService,
  ) {}

  /** Apps que a pessoa pode abrir, com o nome do nível dela em cada um. */
  async appsDaPessoa(userId: string): Promise<(AppDaPessoa & { slug: string; url: string })[]> {
    const [lista, detalhe] = await Promise.all([this.apps.listForUser(userId), this.users.findDetail(userId)]);
    return lista.map((a) => {
      const nivel = (a as { level?: number }).level ?? 0;
      const levels = detalhe?.apps.find((d) => d.slug === a.slug)?.levels ?? [];
      return {
        slug: a.slug,
        url: a.url,
        name: a.name,
        description: a.description,
        level: nivel,
        levelLabel: levels.find((l) => l.level === nivel)?.label,
      };
    });
  }

  async meusApps(userId: string): Promise<string> {
    return textoMeusApps(await this.appsDaPessoa(userId));
  }

  async meuPerfil(user: SafeUser): Promise<string> {
    return textoPerfil(user, await this.sessions.listActive(user.id));
  }

  async resumoPainel(periodo: string): Promise<string> {
    const p = dashboardPeriodSchema.safeParse(periodo);
    return textoPainel(await this.dashboard.get(p.success ? p.data : '30d'));
  }

  async resumoUsuarios(): Promise<string> {
    const r = await this.users.summary();
    return `${r.total} usuários no total: ${r.masters} Master e ${r.admins} Administrador.`;
  }

  private busca(q: string) {
    return this.users.listPage({ filter: 'all', q: q.trim(), take: MAX_ITENS });
  }

  async buscarUsuarios(q: string): Promise<string> {
    if (!q.trim()) return 'Diga parte do nome ou do e-mail para procurar.';
    const pagina = await this.busca(q);
    return textoUsuarios(pagina.items, pagina.nextCursor !== null);
  }

  async detalheUsuario(q: string): Promise<string> {
    if (!q.trim()) return 'Diga o nome ou o e-mail do usuário.';
    const pagina = await this.busca(q);
    if (pagina.items.length !== 1 || pagina.nextCursor) return textoUsuarios(pagina.items, pagina.nextCursor !== null);
    const detalhe = await this.users.findDetail(pagina.items[0].id);
    return detalhe ? textoDetalheUsuario(detalhe) : 'Não achei esse usuário.';
  }
}
