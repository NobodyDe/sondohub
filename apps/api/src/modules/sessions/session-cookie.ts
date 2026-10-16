import type { Response } from 'express';
import { env } from '../../config/env.js';
import { SESSION_TTL_MS } from './sessions.service.js';

const cookieOptions = {
  httpOnly: true, // o JavaScript da página não lê o cookie: um XSS não consegue roubar a sessão
  secure: env.COOKIE_SECURE, // só trafega em HTTPS (no dev, http://localhost, fica false)
  sameSite: 'strict', // outros sites não conseguem fazer o navegador enviar o cookie
  path: '/',
} as const;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions);
}
