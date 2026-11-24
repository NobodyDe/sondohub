import { describe, expect, it } from 'vitest';
import { resolverAcao, type AppAcessivel } from './acoes.js';

const apps: AppAcessivel[] = [
  { slug: 'gemeo', name: 'Gêmeo Digital', url: 'https://gemeo.exemplo' },
  { slug: 'demo', name: 'Demo', url: 'https://demo.exemplo' },
  { slug: 'demo-2', name: 'Demonstração 2', url: 'https://demo2.exemplo' },
];

describe('resolverAcao', () => {
  it('abre tela comum', () => {
    expect(resolverAcao({ acao: 'abrir_tela', tela: 'perfil', app: '' }, apps, false).acao).toMatchObject({
      tipo: 'navegar',
      rota: '/perfil',
    });
  });

  it('tela de administração só para Master', () => {
    const pedido = { acao: 'abrir_tela', tela: 'usuarios', app: '' };
    expect(resolverAcao(pedido, apps, false).acao).toBeUndefined();
    expect(resolverAcao(pedido, apps, true).acao).toMatchObject({ rota: '/admin/usuarios' });
  });

  it('tela desconhecida não vira ação', () => {
    const r = resolverAcao({ acao: 'abrir_tela', tela: 'banco_de_dados', app: '' }, apps, true);
    expect(r.acao).toBeUndefined();
    expect(r.texto).toContain('Não conheço');
  });

  it('abre app pelo nome sem acento e sem caixa', () => {
    expect(resolverAcao({ acao: 'abrir_app', tela: '', app: 'gemeo' }, apps, false).acao).toMatchObject({
      tipo: 'abrir_app',
      slug: 'gemeo',
      url: 'https://gemeo.exemplo',
    });
    expect(resolverAcao({ acao: 'abrir_app', tela: '', app: 'GÊMEO digital' }, apps, false).acao).toBeDefined();
  });

  it('nome ambíguo pergunta; app fora da lista da pessoa não abre', () => {
    const ambiguo = resolverAcao({ acao: 'abrir_app', tela: '', app: 'demo' }, apps, false);
    expect(ambiguo.acao).toBeUndefined();
    expect(ambiguo.texto).toContain('mais de um');
    expect(resolverAcao({ acao: 'abrir_app', tela: '', app: 'financeiro' }, apps, true).acao).toBeUndefined();
  });

  it('voltar e ação desconhecida', () => {
    expect(resolverAcao({ acao: 'voltar', tela: '', app: '' }, apps, false).acao).toMatchObject({ tipo: 'voltar' });
    expect(resolverAcao({ acao: 'apagar', tela: '', app: '' }, apps, true).acao).toBeUndefined();
  });
});
