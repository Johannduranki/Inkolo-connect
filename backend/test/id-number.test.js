import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashIdNumber,
  isValidIdNumber,
  lastFour,
  normalizeIdNumber
} from '../src/id-number.js';

test('normalizes spaces and hyphens', () => {
  assert.equal(normalizeIdNumber('900101-5009 087'), '9001015009087');
});

test('accepts only a sensible digit length', () => {
  assert.equal(isValidIdNumber('9001015009087'), true);
  assert.equal(isValidIdNumber('123'), false);
  assert.equal(isValidIdNumber('ABC123456'), false);
});

test('creates a stable keyed hash without exposing the ID', () => {
  const hash = hashIdNumber('9001015009087', 'test-pepper');
  assert.equal(hash.length, 64);
  assert.equal(hash, hashIdNumber('900101-5009087', 'test-pepper'));
  assert.equal(hash.includes('9001015009087'), false);
});

test('returns the final four digits', () => {
  assert.equal(lastFour('9001015009087'), '9087');
});

