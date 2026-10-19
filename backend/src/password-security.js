import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { verifyImportedPassword } from './imported-password.js';
import { verifyLocalAdminPassword } from './local-admin-password.js';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
let inFlight = 0;

async function key(password, salt) {
  // Bound the memory cost of concurrent authentication requests.
  if (inFlight >= 2) throw Object.assign(new Error('Authentication busy.'), { status: 503 });
  inFlight++;
  try { return await derive(password, salt, 64, options); }
  finally { inFlight--; }
}

export function passwordPolicy(password) {
  return typeof password === 'string' && [...password].length >= 15 && password.length <= 1024;
}

export async function hashPassword(password) {
  if (!passwordPolicy(password)) throw Object.assign(new Error('Use a password of 15 to 1024 characters.'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await key(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password, encoded, pepper) {
  if (typeof password !== 'string' || !password || password.length > 1024 || typeof encoded !== 'string') return false;
  if (/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) {
    const [, salt, hash] = encoded.split(':');
    return timingSafeEqual(await key(password, salt), Buffer.from(hash, 'hex'));
  }
  // Compatibility only: never create a new credential in these formats.
  if (/^\$2[aby]\$/.test(encoded)) return verifyImportedPassword(password, encoded);
  if (/^[a-f0-9]{64}$/i.test(encoded) && typeof pepper === 'string') {
    return timingSafeEqual(Buffer.from(encoded, 'hex'), createHash('sha256').update(`${pepper}:${password}`).digest());
  }
  return verifyLocalAdminPassword(password, encoded);
}
