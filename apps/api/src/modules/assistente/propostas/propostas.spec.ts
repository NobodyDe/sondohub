import type { AdminUserDetail } from '@sondohub/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { UsersRepository } from '../../users/users.repository.js';
import type { AssistenteRepository } from '../assistente.repository.js';
import type { AdminUsersWriter } from './proposta.types.js';
import { AssistentePropostasService } from './propostas.service.js';

const maria: AdminUserDetail = {
  id: 'u-maria',
  name: 'Maria Souza',
  email: 'maria@sondotecnica.com.br',
  avatarUrl: null,
  role: 'USER',
  isActive: true,
  apps: [
    {
      slug: 'experience',
      name: 'Experience',
      hasAccess: false,
      level: null,
      levels: [
        { level: 1, label: 'Administrador' },
        { level: 2, label: 'Usuário' },
      ],
    },
  ],
};

function criarSut() {
  const auditoria: unknown[] = [];
  const users = {
    listPage: vi.fn(async () => ({ items: [maria], nextCursor: null })),
    findDetail: vi.fn(async (id: string) => (id === maria.id ? maria : null)),
  } as unknown as UsersRepository;

  const adminUsers: AdminUsersWriter = {
    setAppLevel: vi.fn(async () => maria),
    removeApp: vi.fn(async () => maria),
    update: vi.fn(async () => maria),
  };

  const repo = {
    gravarPermissao: vi.fn(async () => undefined),
    registrarAuditoria: vi.fn((e: unknown) => auditoria.push(e)),
  } as unknown as AssistenteRepository;

  const service = new AssistentePropostasService(users, adminUsers, repo);
  return { service, users, adminUsers, repo, auditoria };
}

describe('AssistentePropostasService (Human-in-the-Loop)', () => {
  it('cria proposta de liberar_app sem gravar no banco antes da confirmação', async () => {
    const { service, adminUsers } = criarSut();
    const res = await service.criarProposta('master-1', {
      operacao: 'liberar_app',
      usuario: 'Maria',
      app: 'experience',
      valor: 'Administrador',
    });

    expect(adminUsers.setAppLevel).not.toHaveBeenCalled();
    expect(res.acao).toMatchObject({
      tipo: 'confirmar_escrita',
      proposta: {
        operacao: 'liberar_app',
        titulo: 'Liberar Experience',
        detalhe: 'Nível 1 (Administrador)',
        usuarioAlvo: { id: 'u-maria', nome: 'Maria Souza' },
      },
    });

    const propostaId = res.acao?.proposta?.id ?? '';
    const confirmacao = await service.confirmar(propostaId, 'master-1');
    expect(confirmacao.ok).toBe(true);
    expect(adminUsers.setAppLevel).toHaveBeenCalledWith('u-maria', 'experience', 1);
  });

  it('usa o usuário aberto na tela (contexto reativo) quando o Master diz "essa pessoa"', async () => {
    const { service, users } = criarSut();
    const res = await service.criarProposta(
      'master-1',
      { operacao: 'autorizar_assistente', usuario: 'essa pessoa', valor: 'sim' },
      { rota: '/admin/usuarios/u-maria', estado: { usuarioVisto: { id: 'u-maria', nome: 'Maria Souza' } } },
    );

    expect(users.listPage).not.toHaveBeenCalled();
    expect(res.acao?.proposta?.usuarioAlvo.id).toBe('u-maria');
  });

  it('impede confirmar proposta expirada ou de outro usuário', async () => {
    const { service, adminUsers } = criarSut();
    const res = await service.criarProposta(
      'master-1',
      { operacao: 'alterar_cargo', usuario: 'Maria', valor: 'Administrador' },
      null,
      1000,
    );
    const id = res.acao?.proposta?.id ?? '';

    const outroUsuario = await service.confirmar(id, 'outro-master', 2000);
    expect(outroUsuario.ok).toBe(false);

    const expirada = await service.confirmar(id, 'master-1', 1000 + 300_000);
    expect(expirada.ok).toBe(false);
    expect(adminUsers.update).not.toHaveBeenCalled();
  });
});
