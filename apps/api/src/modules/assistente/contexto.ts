/** Snapshot da tela enviado pelo navegador. Só campos conhecidos e texto curto (máx. 4 KB). Nunca credenciais. */
export const MAX_BYTES_CONTEXTO = 4096;

export type ContextoTela = {
  rota?: string;
  titulo?: string;
  breakpoint?: 'mobile' | 'desktop';
  /** Estado reativo publicado pela página aberta (usuário visto, filtros da tabela, período do painel). */
  estado?: Record<string, unknown>;
};

const CHAVE_SENSIVEL = /token|senha|password|auth|secret|credencial|chave|cookie|hash|key/i;

const curto = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** Sanitiza um objeto mantendo apenas tipos primitivos seguros, listas curtas e até 1 nível de objeto aninhado. */
function sanitizarObjeto(bruto: unknown, nivel = 0, maxChaves = 20): Record<string, unknown> | undefined {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return undefined;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>).slice(0, maxChaves)) {
    if (CHAVE_SENSIVEL.test(k)) continue;
    if (typeof v === 'string') saida[k] = v.slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) saida[k] = v;
    else if (typeof v === 'boolean') saida[k] = v;
    else if (Array.isArray(v)) {
      saida[k] = v
        .slice(0, 10)
        .map((i) => (typeof i === 'string' ? i.slice(0, 80) : typeof i === 'number' && Number.isFinite(i) ? i : null))
        .filter((i) => i !== null);
    } else if (nivel < 1 && v && typeof v === 'object') {
      const sub = sanitizarObjeto(v, nivel + 1, 10);
      if (sub && Object.keys(sub).length > 0) saida[k] = sub;
    }
  }
  return Object.keys(saida).length > 0 ? saida : undefined;
}

export function lerContextoTela(bruto: unknown): ContextoTela | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  const estado = sanitizarObjeto(b.estado);
  const ctx: ContextoTela = {
    ...(curto(b.rota) ? { rota: curto(b.rota) } : {}),
    ...(curto(b.titulo) ? { titulo: curto(b.titulo) } : {}),
    ...(b.breakpoint === 'mobile' || b.breakpoint === 'desktop' ? { breakpoint: b.breakpoint } : {}),
    ...(estado ? { estado } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(ctx)) > MAX_BYTES_CONTEXTO) return null;
  return ctx;
}
