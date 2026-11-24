import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    EXPERIENCE_API_URL: 'http://exp.test/api',
    EXPERIENCE_API_KEY: 'sk_sondo_x',
  },
}));
const { ExperienceClient } = await import('./experience-client.js');

const ID = '11111111-1111-4111-8111-111111111111';
const user = { name: 'Ana', email: 'ana@sondotecnica.com.br' };
const stubFetch = (response: Partial<Response> | Error) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve({
            ok: true,
            text: () => Promise.resolve(''),
            ...response,
          }),
    ),
  );

describe('ExperienceClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PUT com a chave, o nível virando adm', async () => {
    stubFetch({});
    await new ExperienceClient().upsertUser(ID, user, 1);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`http://exp.test/api/sondohub/users/${ID}`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe(
      'sk_sondo_x',
    );
    expect(JSON.parse(init?.body as string)).toEqual({ ...user, adm: 1 });
  });

  it('nível sem adm equivalente não chama o Experience', async () => {
    stubFetch({});
    await expect(
      new ExperienceClient().upsertUser(ID, user, 3),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Experience recusou: 502, para o hub não salvar', async () => {
    stubFetch({ ok: false, status: 401 });
    await expect(
      new ExperienceClient().upsertUser(ID, user, 2),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('inativar não lança nem com o Experience fora do ar', async () => {
    stubFetch(new Error('ECONNREFUSED'));
    await expect(
      new ExperienceClient().deactivateUser(ID),
    ).resolves.toBeUndefined();
  });
});
