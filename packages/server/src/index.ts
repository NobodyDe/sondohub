import type { SondoUser } from "@sondohub/contracts";
import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type SondoAuthOptions = { hubUrl: string; audience: string };

type SondoClaims = JWTPayload & Omit<SondoUser, "id">;

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware sondoAuth depois de validar o token. */
      sondoUser?: SondoUser;
    }
  }
}

export function createTokenVerifier({ hubUrl, audience }: SondoAuthOptions) {
  // Baixa a chave pública uma vez e guarda em cache; só busca de novo se aparecer um kid novo.
  const jwks = createRemoteJWKSet(
    new URL("/api/.well-known/jwks.json", hubUrl),
  );

  return async function verifyAccessToken(token: string): Promise<SondoUser> {
    const { payload } = await jwtVerify<SondoClaims>(token, jwks, {
      issuer: hubUrl, // foi o hub que emitiu?
      audience, // foi emitido para ESTE app?
      algorithms: ["RS256"], // nunca aceite o algoritmo que o próprio token declara
      requiredClaims: ["sub"],
    });
    return {
      id: payload.sub!,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      level: payload.level,
    };
  };
}

export function sondoAuth(options: SondoAuthOptions): RequestHandler {
  const verifyAccessToken = createTokenVerifier(options);

  return async (req, res, next) => {
    const [scheme, token] = req.get("authorization")?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
      res.sendStatus(401);
      return;
    }
    try {
      req.sondoUser = await verifyAccessToken(token);
      next();
    } catch {
      res.sendStatus(401); // assinatura inválida, expirado, aud errado...
    }
  };
}
