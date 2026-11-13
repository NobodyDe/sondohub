import { describe, expect, it, vi } from 'vitest';
import { SsoService } from './sso.service.js';

// O TokenService lê o env ao ser importado; o teste usa um mock no lugar dele.
vi.mock('./token.service.js', () => ({
  ACCESS_TOKEN_TTL_SECONDS: 600,
  TokenService: class {},
}));

const user = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@sondotecnica.com.br',
  avatarUrl: null,
};

function setup(recordOpen: () => Promise<void>) {
  const apps = {
    findActiveByOrigin: vi.fn().mockResolvedValue({ id: 'a1', slug: 'demo' }),
    findAccessLevel: vi.fn().mockResolvedValue({ level: 1 }),
  };
  const tokens = { sign: vi.fn().mockResolvedValue('jwt') };
  const events = { recordOpen: vi.fn(recordOpen) };
  const service = new SsoService(apps as never, tokens as never, events as never);
  return { service, events };
}

describe('SsoService.issueToken', () => {
  it('registra a abertura ao emitir o token', async () => {
    const { service, events } = setup(() => Promise.resolve());

    await service.issueToken(user as never, 'http://localhost:5174');

    expect(events.recordOpen).toHaveBeenCalledWith('u1', 'a1');
  });

  it('emite o token mesmo se registrar a abertura falhar', async () => {
    const { service } = setup(() => Promise.reject(new Error('db fora')));

    const response = await service.issueToken(user as never, 'http://localhost:5174');

    expect(response.accessToken).toBe('jwt');
  });
});
