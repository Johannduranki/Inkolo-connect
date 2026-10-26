import { fork } from 'node:child_process';

export function integrationEnvironment(source = process.env) {
  if (source.MARIADB_HTTP_TEST !== '1') throw Error('Set MARIADB_HTTP_TEST=1 for an externally provisioned disposable Docker database.');
  if (!/^(?:test_[a-z0-9_]+|[a-z0-9]+_test(?:_[a-z0-9_]+)?)$/.test(source.DB_NAME || '')) {
    throw Error('DB_NAME must be a test-only name such as duranki_test_http.');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(source.DB_HOST)) throw Error('DB_HOST must be loopback for a disposable Docker database.');
  if (!/^\d+$/.test(source.DB_PORT || '') || +source.DB_PORT < 1 || +source.DB_PORT > 65535) throw Error('DB_PORT must be explicitly supplied.');
  if (!source.DB_USER || typeof source.DB_PASSWORD !== 'string') throw Error('DB_USER and DB_PASSWORD must be explicitly supplied (empty password is allowed).');
  const key = source.MFA_ENCRYPTION_KEY;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key || '') || Buffer.from(key, 'base64').toString('base64') !== key) {
    throw Error('MFA_ENCRYPTION_KEY must match bootstrap: canonical base64 encoding of 32 bytes.');
  }
  const env = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'HOME']) {
    if (source[name]) env[name] = source[name];
  }
  for (const name of ['MARIADB_HTTP_TEST', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'MFA_ENCRYPTION_KEY']) env[name] = source[name];
  Object.assign(env, { NODE_ENV: 'test', ID_PEPPER: 'synthetic-http-integration-pepper',
    JWT_SECRET: 'synthetic-http-integration-secret-not-for-deployment',
    ALLOW_DEMO_AUTH: 'false', FORCE_DEMO_MODE: 'false', LOG_DESTINATION: 'stdout',
    FRONTEND_ORIGIN: 'http://localhost:4200' });
  for (const name of ['PLATFORM_STORAGE', 'AUTH_STORAGE', 'TREASURY_STORAGE', 'TRAINING_STORAGE', 'CYCLE_STORAGE', 'HERITAGE_STORAGE']) env[name] = 'mariadb';
  return env;
}

export async function startApi() {
  const child = fork(new URL('./http-server.js', import.meta.url), [], {
    env: integrationEnvironment(), execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-12000); });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await exited;
  };
  const wait = expected => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(Error(`HTTP child timed out waiting for ${expected}\n${output}`)), 30000);
    const onMessage = message => {
      if (message.type === 'failure') finish(Error(message.message));
      else if (message.type === expected) finish(null, message);
    };
    const onExit = code => finish(Error(`HTTP child exited (${code}) before ${expected}\n${output}`));
    const onError = error => finish(error);
    function finish(error, message) {
      clearTimeout(timer);
      child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError);
      if (error) reject(error); else resolve(message);
    }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  try {
    const { url } = await wait('ready');
    return { url, stop, async disconnectDatabase() {
      const result = wait('disconnected');
      child.send({ type: 'disconnect' });
      await result;
    }, async promoteFixture(id, phone) {
      const result = wait('promoted');
      child.send({ type: 'promote', id, phone });
      await result;
    } };
  } catch (error) { await stop(); throw error; }
}
