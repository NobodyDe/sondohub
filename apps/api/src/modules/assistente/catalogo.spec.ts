import { describe, expect, it } from 'vitest';
import type { AssistenteRepository } from './assistente.repository.js';
import { ferramentasDaSessao, NOMES_FERRAMENTAS } from './catalogo.js';
import type { AssistenteConsultas } from './consultas.js';
import { AssistenteExecutor, type ContextoFerramentas } from './executor.js';
import { NOMES_SO_MASTER } from './ferramentas.js';
import { GUIA_HUB, GUIA_MASTER, GUIA_MEMORIA } from './guia.js';
import { promptSistema } from './prompt.js';

const nomes = (o: Parameters<typeof ferramentasDaSessao>[0]) => ferramentasDaSessao(o).map((f) => f.name);

describe('catálogo', () => {
  it('sem nomes repetidos', () => {
    expect(new Set(NOMES_FERRAMENTAS).size).toBe(NOMES_FERRAMENTAS.length);
  });

  it('toda ferramenta aparece no prompt (guia)', () => {
    const texto = [GUIA_HUB, GUIA_MASTER, GUIA_MEMORIA, promptSistema({ internet: true, master: true })].join('\n');
    const fora = NOMES_FERRAMENTAS.filter((n) => !texto.includes(n));
    expect(fora).toEqual([]);
  });

  it('quem não é Master não recebe as ferramentas de administração', () => {
    const comum = nomes({ internet: false, master: false });
    for (const n of NOMES_SO_MASTER) expect(comum).not.toContain(n);
    expect(nomes({ internet: false, master: true })).toEqual(expect.arrayContaining([...NOMES_SO_MASTER]));
  });

  it('internet só entra quando ligada', () => {
    expect(nomes({ internet: false, master: false })).not.toContain('pesquisar_web');
    expect(nomes({ internet: true, master: false })).toContain('pesquisar_web');
  });
});

describe('executor', () => {
  const auditoria: unknown[] = [];
  const repo = { registrarAuditoria: (e: unknown) => auditoria.push(e) } as unknown as AssistenteRepository;
  let chamadas = 0;
  const consultas = {
    resumoPainel: async () => {
      chamadas++;
      return 'painel';
    },
    resumoUsuarios: async () => 'usuarios',
  } as unknown as AssistenteConsultas;
  const executor = new AssistenteExecutor(repo, consultas);
  const ctx = (role: string, extra: Partial<ContextoFerramentas> = {}) =>
    ({ user: { id: 'u1', role }, chaveGemini: '', internet: false, ...extra }) as ContextoFerramentas;

  it('ferramenta de Master é recusada no servidor para quem não é Master, sem rodar', async () => {
    chamadas = 0;
    for (const role of ['USER', 'ADMIN']) {
      const r = await executor.executar('resumo_painel', {}, ctx(role));
      expect(r).toContain('só para o Master');
    }
    expect(chamadas).toBe(0);
    expect(auditoria.at(-1)).toMatchObject({ ferramenta: 'resumo_painel', bloqueada: true });
  });

  it('Master roda a ferramenta', async () => {
    expect(await executor.executar('resumo_painel', {}, ctx('MASTER'))).toBe('painel');
  });

  it('ferramenta bloqueada por regra é recusada sem rodar', async () => {
    chamadas = 0;
    const r = await executor.executar('resumo_painel', {}, ctx('MASTER', { bloqueadas: new Set(['resumo_painel']) }));
    expect(r).toContain('bloqueada por uma regra');
    expect(chamadas).toBe(0);
  });

  it('nome desconhecido e erro interno nunca lançam', async () => {
    expect(await executor.executar('nao_existe', {}, ctx('MASTER'))).toBe('Ferramenta desconhecida.');
    const quebrado = new AssistenteExecutor(repo, {
      resumoUsuarios: async () => {
        throw new Error('boom');
      },
    } as unknown as AssistenteConsultas);
    expect(await quebrado.executar('resumo_usuarios', {}, ctx('MASTER'))).toBe('Não consegui obter essa informação agora.');
  });
});

describe('prompt', () => {
  it('sem nome, o assistente pergunta; com nome, responde o nome', () => {
    expect(promptSistema({})).toContain('ainda não tem nome');
    expect(promptSistema({ nomeAssistente: 'Sondinha' })).toContain('Seu nome é Sondinha');
  });

  it('guia do Master só para Master', () => {
    expect(promptSistema({ master: false })).not.toContain('ÁREA DO MASTER');
    expect(promptSistema({ master: true })).toContain('ÁREA DO MASTER');
  });

  it('canal texto avisa que é digitado', () => {
    expect(promptSistema({ canal: 'texto' })).toContain('conversa digitando');
    expect(promptSistema({})).not.toContain('conversa digitando');
  });
});
