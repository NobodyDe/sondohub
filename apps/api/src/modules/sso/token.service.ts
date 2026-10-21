import { Injectable } from '@nestjs/common';
import type { SondoUser } from '@sondohub/contracts';
import { SignJWT } from 'jose';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'RS256';
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

@Injectable()
export class TokenService {
  // A chave chega em base64 no .env (uma linha só) e é decodificada uma vez, no boot.
  private readonly privateKey = createPrivateKey(
    Buffer.from(env.JWT_PRIVATE_KEY, 'base64').toString('utf8'),
  );

  sign(audience: string, { id, ...claims }: SondoUser): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM, kid: env.JWT_KEY_ID })
      .setIssuer(env.HUB_URL)
      .setSubject(id)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }

  /** Só a chave PÚBLICA: é o que os backends dos apps usam para conferir a assinatura. */
  getJwks() {
    const publicJwk = createPublicKey(this.privateKey).export({
      format: 'jwk',
    });
    return {
      keys: [{ ...publicJwk, kid: env.JWT_KEY_ID, alg: ALGORITHM, use: 'sig' }],
    };
  }
}
