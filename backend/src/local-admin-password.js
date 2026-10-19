import { scryptSync, timingSafeEqual } from 'node:crypto';

export function verifyLocalAdminPassword(password, encoded) {
  if (typeof password !== 'string' || !password || password.length > 1024) return false;
  const [salt, hash] = String(encoded ?? '').split(':');
  if (!/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
