// Funções puras do upgrade do WebSocket (sem env, para testar sem subir a API).

/** Lê um cookie do header bruto. O WebSocket não passa pelo cookie-parser do Express. */
export function lerCookie(header: string | undefined, nome: string): string | undefined {
  for (const par of (header ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nome) {
      try {
        return decodeURIComponent(par.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** O navegador sempre manda o Origin no upgrade: só o próprio hub pode abrir a sessão (evita sequestro entre sites). */
export function origemPermitida(origin: string | undefined, hubUrl: string): boolean {
  return !!origin && origin === new URL(hubUrl).origin;
}
