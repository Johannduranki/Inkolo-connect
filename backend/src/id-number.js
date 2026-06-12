import { createHmac } from 'node:crypto';

export function normalizeIdNumber(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function isValidIdNumber(value) {
  return /^\d{6,20}$/.test(normalizeIdNumber(value));
}

export function hashIdNumber(value, pepper) {
  return createHmac('sha256', pepper)
    .update(normalizeIdNumber(value))
    .digest('hex');
}

export function lastFour(value) {
  return normalizeIdNumber(value).slice(-4);
}

