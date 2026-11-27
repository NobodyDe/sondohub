import { describe, expect, it } from 'vitest';
import { lerContextoTela } from './contexto.js';

describe('lerContextoTela', () => {
  it('lê rota, título, breakpoint e estado reativo da página', () => {
    const ctx = lerContextoTela({
      rota: '/admin/usuarios/u1',
      titulo: 'SondoHub',
      breakpoint: 'desktop',
      estado: {
        pagina: 'detalhe_usuario',
        usuarioVisto: { id: 'u1', nome: 'Maria Souza', email: 'maria@sondo.com', cargo: 'USER' },
        appsLiberados: ['Gêmeo Digital', 'Experience'],
      },
    });
    expect(ctx).toEqual({
      rota: '/admin/usuarios/u1',
      titulo: 'SondoHub',
      breakpoint: 'desktop',
      estado: {
        pagina: 'detalhe_usuario',
        usuarioVisto: { id: 'u1', nome: 'Maria Souza', email: 'maria@sondo.com', cargo: 'USER' },
        appsLiberados: ['Gêmeo Digital', 'Experience'],
      },
    });
  });

  it('remove chaves sensíveis do estado', () => {
    const ctx = lerContextoTela({
      rota: '/perfil',
      estado: {
        pagina: 'perfil',
        token: 'jwt-secreto',
        passwordHash: 'argon2',
        apiKey: 'sk_123',
        usuarioVisto: { nome: 'João', senha: '123' },
      },
    });
    expect(ctx?.estado).toEqual({
      pagina: 'perfil',
      usuarioVisto: { nome: 'João' },
    });
  });

  it('devolve null para entrada inválida', () => {
    expect(lerContextoTela(null)).toBeNull();
    expect(lerContextoTela('texto')).toBeNull();
  });
});
