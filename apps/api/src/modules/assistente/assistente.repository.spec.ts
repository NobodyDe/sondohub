import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AssistenteRepository } from './assistente.repository.js';

const repoCom = (autorizado: boolean | null) =>
  new AssistenteRepository({
    assistentePermissao: { findUnique: async () => (autorizado === null ? null : { autorizado }) },
  } as unknown as PrismaService);

describe('assistente/permissão', () => {
  it('Master sempre pode, sem consultar o switch', async () => {
    expect(await repoCom(null).usuarioPodeUsar({ id: '1', role: 'MASTER', isActive: true })).toBe(true);
  });

  it('usuário comum só com o switch ligado', async () => {
    const user = { id: '2', role: 'USER', isActive: true };
    expect(await repoCom(true).usuarioPodeUsar(user)).toBe(true);
    expect(await repoCom(false).usuarioPodeUsar(user)).toBe(false);
    expect(await repoCom(null).usuarioPodeUsar(user)).toBe(false);
  });

  it('ADMIN não é Master: também depende do switch', async () => {
    expect(await repoCom(null).usuarioPodeUsar({ id: '3', role: 'ADMIN', isActive: true })).toBe(false);
  });

  it('usuário inativo nunca, nem Master', async () => {
    expect(await repoCom(true).usuarioPodeUsar({ id: '4', role: 'MASTER', isActive: false })).toBe(false);
  });
});
