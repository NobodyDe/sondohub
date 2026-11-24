import type { AdminDashboard, AdminUser, AdminUserDetail } from '@sondohub/contracts';
import { describe, expect, it } from 'vitest';
import { textoDetalheUsuario, textoMeusApps, textoPainel, textoPerfil, textoUsuarios } from './consultas.js';

describe('textoMeusApps', () => {
  it('sem acesso', () => {
    expect(textoMeusApps([])).toContain('ainda não tem acesso');
  });
  it('mostra o nome do nível quando existe, senão o número', () => {
    const t = textoMeusApps([
      { name: 'Gêmeo', description: 'BIM', level: 2, levelLabel: 'Editor' },
      { name: 'Demo', description: 'Teste', level: 1 },
    ]);
    expect(t).toContain('2 aplicativos');
    expect(t).toContain('Gêmeo (nível Editor): BIM');
    expect(t).toContain('Demo (nível 1): Teste');
  });
});

describe('textoPerfil', () => {
  it('nunca traz o ip nem o agente do navegador', () => {
    const t = textoPerfil({ name: 'Ana', email: 'ana@x.com', role: 'ADMIN' }, [
      { userAgent: 'Mozilla/5.0', createdAt: new Date() },
    ]);
    expect(t).toContain('Cargo: Administrador');
    expect(t).toContain('1 dispositivo agora');
    expect(t).not.toContain('Mozilla');
  });
});

const painel = (over: Partial<AdminDashboard> = {}) =>
  ({
    period: '30d',
    users: { active: 8, total: 10, createdByMonth: [] },
    logins: { total: 150, previous: 100, series: [] },
    sessions: { open: 4, people: 3, desktop: 3, mobile: 1 },
    activation: { everLoggedIn: 9, total: 10 },
    newUsers: { series: [], previous: 0 },
    appUsers: [],
    grants: { series: [], previous: 0 },
    loginHeatmap: [],
    loginRanking: { top: [], bottom: [] },
    sessionRanking: { top: [], bottom: [] },
    appUsage: [
      { slug: 'a', name: 'A', opens: 5, previousOpens: 0, clicks: 0, previousClicks: 0 },
      { slug: 'b', name: 'B', opens: 20, previousOpens: 0, clicks: 0, previousClicks: 0 },
    ],
    attention: { inactive30d: 2, withoutApps: 1, deactivated: 0 },
    ...over,
  }) as AdminDashboard;

describe('textoPainel', () => {
  it('traz variação calculada no servidor e os apps mais abertos primeiro', () => {
    const t = textoPainel(painel());
    expect(t).toContain('últimos 30 dias');
    expect(t).toContain('150 (50 por cento a mais que o período anterior)');
    expect(t).toContain('B (20), A (5)');
    expect(t).toContain('8 ativos de 10');
  });
  it('período anterior zerado não divide por zero', () => {
    expect(textoPainel(painel({ logins: { total: 5, previous: 0, series: [] } }))).toContain('sem base de comparação');
  });
});

const usuario = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: '1',
  name: 'Maria Souza',
  email: 'maria@x.com',
  avatarUrl: null,
  role: 'USER',
  isActive: true,
  apps: [{ slug: 'g', name: 'Gêmeo', level: 1 }],
  ...over,
});

describe('textoUsuarios', () => {
  it('lista e avisa quando há mais resultados', () => {
    expect(textoUsuarios([usuario()], true)).toContain('Há mais resultados');
    expect(textoUsuarios([], false)).toContain('Não achei');
  });
  it('marca desativado e usuário sem app', () => {
    const t = textoUsuarios([usuario({ isActive: false, apps: [] })], false);
    expect(t).toContain('desativado');
    expect(t).toContain('nenhum aplicativo');
  });
  it('nunca vaza campo sensível', () => {
    const t = textoUsuarios([{ ...usuario(), passwordHash: 'segredo' } as AdminUser], false);
    expect(t).not.toContain('segredo');
  });
});

describe('textoDetalheUsuario', () => {
  it('só os apps com acesso, com o nome do nível', () => {
    const d = {
      ...usuario(),
      apps: [
        { slug: 'g', name: 'Gêmeo', hasAccess: true, level: 2, levels: [{ level: 2, label: 'Editor' }] },
        { slug: 'd', name: 'Demo', hasAccess: false, level: null, levels: [] },
      ],
    } as AdminUserDetail;
    const t = textoDetalheUsuario(d);
    expect(t).toContain('Gêmeo (nível Editor)');
    expect(t).not.toContain('Demo');
  });
});
