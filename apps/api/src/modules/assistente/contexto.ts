/** Snapshot da tela enviado pelo navegador. Só campos conhecidos e texto curto. Nunca credenciais. */
export type ContextoTela = {
  rota?: string;
  titulo?: string;
  breakpoint?: 'mobile' | 'desktop';
};

const curto = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export function lerContextoTela(bruto: unknown): ContextoTela | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  return {
    ...(curto(b.rota) ? { rota: curto(b.rota) } : {}),
    ...(curto(b.titulo) ? { titulo: curto(b.titulo) } : {}),
    ...(b.breakpoint === 'mobile' || b.breakpoint === 'desktop' ? { breakpoint: b.breakpoint } : {}),
  };
}
