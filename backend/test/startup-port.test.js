import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { assertPortAvailable } from '../src/startup-port.js';

test('available port probe closes its listener', async () => {
  await assertPortAvailable(0);
});

test('occupied API port fails before storage initialization', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, resolve));
  try {
    await assert.rejects(assertPortAvailable(server.address().port), {code:'EADDRINUSE'});
    assert.equal(server.listening, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
