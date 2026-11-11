import argon2 from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { PasswordResetService } from './password-reset.service.js';

// O MailService lê o env ao ser importado; o teste não precisa dele.
vi.mock('../mail/mail.service.js', () => ({ MailService: class {} }));

const input = { email: 'ana@x.com', code: '123456', password: 'Nova@1234' };

async function setup(row: { attempts?: number; expiresAt?: Date } = {}) {
  const reset = {
    codeHash: await argon2.hash('123456'),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    ...row,
  };
  const prisma = {
    passwordResetCode: {
      findUnique: vi.fn().mockResolvedValue(reset),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const users = {
    findByEmail: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }),
    setPassword: vi.fn(),
  };
  const sessions = { revokeAll: vi.fn() };
  const service = new PasswordResetService(
    prisma as never,
    users as never,
    sessions as never,
    {} as never,
  );
  return { service, prisma, users, sessions };
}

describe('PasswordResetService', () => {
  it('troca a senha, derruba as sessões e queima o código', async () => {
    const { service, prisma, users, sessions } = await setup();
    await service.confirm(input);
    expect(users.setPassword).toHaveBeenCalledWith('u1', expect.any(String));
    expect(sessions.revokeAll).toHaveBeenCalledWith('u1');
    expect(prisma.passwordResetCode.delete).toHaveBeenCalled();
  });

  it('código errado conta uma tentativa e não troca a senha', async () => {
    const { service, prisma, users } = await setup();
    await expect(service.confirm({ ...input, code: '000000' })).rejects.toThrow();
    expect(prisma.passwordResetCode.update).toHaveBeenCalled();
    expect(users.setPassword).not.toHaveBeenCalled();
  });

  it('recusa código vencido', async () => {
    const { service } = await setup({ expiresAt: new Date(Date.now() - 1) });
    await expect(service.verify(input)).rejects.toThrow();
  });

  it('recusa o código certo depois de 5 tentativas', async () => {
    const { service } = await setup({ attempts: 5 });
    await expect(service.verify(input)).rejects.toThrow();
  });
});
