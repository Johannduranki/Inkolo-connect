import 'dotenv/config';
import mysql from 'mysql2/promise';

// Read-only checks: no credentials, table rows or provider settings are emitted.
const origin = 'http://127.0.0.1:4200';
const checks = [];
const check = (name, passed, detail) => checks.push({ name, passed, ...(detail ? { detail } : {}) });
const get = (path, options = {}) => fetch(origin + path, { ...options, redirect: 'manual', signal: AbortSignal.timeout(5000) });
let connection;
try {
  const health = await (await get('/api/health')).json();
  const stores = ['authenticationStorage','treasuryStorage','platformStorage','walletStorage','trainingStorage','cycleStorage','heritageStorage'];
  check('api_and_all_mariadb_stores', health.status === 'ok' && stores.every(key => health[key] === 'mariadb'));
  for (const path of ['/api/auth/me','/api/subscriptions','/api/platform/profile','/api/platform/admin/users','/api/platform/wallet','/api/platform/rides/available','/api/community-reports','/api/tenant-access','/api/branding','/api/service-pricing','/api/treasury','/api/heritage','/api/trader-training','/api/cycle']) {
    const response = await get(path); await response.arrayBuffer();
    check(`anonymous_denied:${path}`, response.status === 401 && response.headers.get('cache-control') === 'no-store');
  }
  const malformed = await get('/api/auth/me', { headers: { authorization: 'Bearer synthetic-invalid-token' } });
  check('malformed_token_denied', malformed.status === 401); await malformed.arrayBuffer();
  const foreignOrigin = await get('/api/health', { headers: { origin: 'https://untrusted.invalid' } });
  check('foreign_origin_denied', foreignOrigin.status === 403 && !foreignOrigin.headers.has('access-control-allow-origin')); await foreignOrigin.arrayBuffer();
  const login = await get('/login');
  check('static_browser_headers', login.status === 200 && login.headers.get('x-content-type-options') === 'nosniff' && login.headers.get('x-frame-options') === 'DENY' && login.headers.get('referrer-policy') === 'no-referrer' && login.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")); await login.arrayBuffer();
  connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectTimeout: 5000 });
  const [[identity]] = await connection.query('SELECT CURRENT_USER() AS account');
  check('database_application_account_not_root', !String(identity.account).toLowerCase().startsWith('root@'));
  const [rows] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
  const expectedScope = '`' + process.env.DB_NAME.replaceAll('`','``') + '`.*';
  const allowed = new Set(['SELECT','INSERT','UPDATE','DELETE']);
  let applicationScope = false;
  const leastPrivilege = rows.every(row => {
    const grant = String(Object.values(row)[0]);
    const match = /^GRANT (.+?) ON (.+?) TO /.exec(grant);
    if (!match || /WITH GRANT OPTION/.test(grant)) return false;
    const privileges = match[1].split(',').map(value => value.trim());
    if (match[2] === '*.*' && privileges.length === 1 && privileges[0] === 'USAGE') return true;
    if (match[2] !== expectedScope || !privileges.every(value => allowed.has(value))) return false;
    applicationScope = true; return true;
  });
  check('database_grants_single_schema_dml_only', leastPrivilege && applicationScope);
  const [[binding]] = await connection.query('SELECT @@bind_address AS address');
  check('database_listens_only_on_loopback', ['127.0.0.1','::1','localhost'].includes(binding.address));
  const [tls] = await connection.query("SHOW STATUS LIKE 'Ssl_cipher'");
  console.log(JSON.stringify({ checks, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, localDatabaseTls: Boolean(tls[0]?.Value), limitations: 'Read-only local smoke checks only. No authenticated user journey, production TLS, restore drill, payment or global security certification.' }, null, 2));
  if (checks.some(c => !c.passed)) process.exitCode = 1;
} catch {
  console.error('Security smoke checks could not complete. Inspect protected local configuration; no credentials or internal errors are printed.');
  process.exitCode = 1;
} finally { await connection?.end(); }
