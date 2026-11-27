import { describe, expect, it, vi } from 'vitest';
import type { AssistenteConsultas } from '../consultas.js';
import { AssistenteFederacaoService, resolverEndpointAppFilho } from './federacao.service.js';

const usuario = {
  id: 'u-1',
  name: 'Henrique Santos',
  email: 'henrique@sondotecnica.com.br',
  role: 'MASTER' as const,
};

function criarSut() {
  const consultas = {
    appsDaPessoa: vi.fn(async () => [
      {
        slug: 'sondoview',
        url: 'https://sondoview.sondotecnica.com',
        name: 'SondoView',
        description: 'Avanço físico de obras, curva S e mapa 3D',
        level: 1,
        levelLabel: 'Diretoria',
      },
      {
        slug: 'experience',
        url: 'https://experience.sondotecnica.com',
        name: 'Experience',
        description: 'Eventos e pesquisa de satisfação',
        level: 1,
        levelLabel: 'Administrador',
      },
    ]),
  } as unknown as AssistenteConsultas;

  return { service: new AssistenteFederacaoService(consultas), consultas };
}

describe('AssistenteFederacaoService (MCP HTTP)', () => {
  it('bloqueia consulta a aplicativo que o usuário não tem acesso', async () => {
    const { service } = criarSut();
    const fetcher = vi.fn();
    const res = await service.consultarAppFilho(usuario, { app: 'Financeiro', consulta: 'resumo' }, fetcher as never);

    expect(fetcher).not.toHaveBeenCalled();
    expect(res).toContain('não tem acesso');
    expect(res).toContain('SondoView, Experience');
  });

  it('envia consulta federada com X-Api-Key e X-Hub-User-Id e devolve resposta do app filho', async () => {
    const { service } = criarSut();
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, texto: '3 agências ativas, avanço médio de 68,4 por cento.' }),
    }));

    const res = await service.consultarAppFilho(
      usuario,
      { app: 'sondoview', consulta: 'Como está o avanço das agências?' },
      fetcher as never,
      { SONDOVIEW_API_URL: 'https://api-sondoview.sondotecnica.com/api', SONDOVIEW_API_KEY: 'sk_sondo_123' },
    );

    expect(fetcher).toHaveBeenCalledWith(
      'https://api-sondoview.sondotecnica.com/api/sondohub/assistant/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk_sondo_123',
          'x-hub-user-id': 'u-1',
          'x-hub-user-email': 'henrique@sondotecnica.com.br',
        }),
      }),
    );
    expect(res).toBe('[SondoView] 3 agências ativas, avanço médio de 68,4 por cento.');
  });

  it('devolve fallback elegante com o nível da pessoa se o app filho estiver offline ou sem endpoint', async () => {
    const { service } = criarSut();
    const fetcher = vi.fn(async () => ({ ok: false, status: 404 }));

    const res = await service.consultarAppFilho(
      usuario,
      { app: 'experience', consulta: 'Quais eventos estão ativos?' },
      fetcher as never,
      { EXPERIENCE_API_URL: 'http://localhost:3000/api', EXPERIENCE_API_KEY: 'sk_exp' },
    );

    expect(res).toContain('tem acesso ativo ao Experience (nível Administrador');
    expect(res).toContain('Ofereça abrir o Experience');
  });

  it('usa http://localhost:3030 para o Gêmeo Digital em ambiente de desenvolvimento local', () => {
    expect(
      resolverEndpointAppFilho('gemeo', {
        HUB_URL: 'http://localhost:5180',
        GDS_APY_KEY: 'chave-dev',
      }),
    ).toEqual({
      apiUrl: 'http://localhost:3030',
      apiKey: 'chave-dev',
    });

    expect(
      resolverEndpointAppFilho('gemeo', {
        HUB_URL: 'https://hub.sondotecnica.com',
        GDS_APY_KEY: 'chave-prod',
      }),
    ).toEqual({
      apiUrl: 'https://gds-techlab.sondotecnica.com',
      apiKey: 'chave-prod',
    });
  });
});
