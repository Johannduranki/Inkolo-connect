import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
const issuer = 'duranki';
const audience = 'duranki-api';

export function signToken(payload, secret, expiresIn) {
  return jwt.sign({ ...payload, jti: payload.jti || randomUUID() }, secret,
    { algorithm: 'HS256', issuer, audience, expiresIn });
}

export function verifyToken(token, secret) {
  const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
  if (!claims || typeof claims === 'string' || typeof claims.sub !== 'string' || !claims.sub ||
      typeof claims.jti !== 'string' || !Number.isFinite(claims.exp) || !Number.isFinite(claims.iat) ||
      claims.iat > Math.floor(Date.now() / 1000) + 30) throw new Error('Invalid session.');
  return claims;
}
