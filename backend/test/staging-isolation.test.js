import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Source contract checks run without Docker or access to an operator environment.
const compose=readFileSync(new URL('../../docker-compose.yml',import.meta.url),'utf8');

test('optional release inherits its private MFA key without requiring shell interpolation',()=>{
  const release=readFileSync(new URL('../../deploy/compose.yml',import.meta.url),'utf8');
  assert.match(release,/env_file: \/srv\/duranki\/production\.env/);
  assert.doesNotMatch(release,/^\s+MFA_ENCRYPTION_KEY:/m);
});

test('Docker backend explicitly selects MariaDB and disables demo authentication',()=>{
  for(const name of ['PLATFORM','AUTH','TREASURY','TRAINING','CYCLE','HERITAGE']) {
    assert.match(compose,new RegExp('^    '+name+'_STORAGE: mariadb\\r?$','m'));
  }
  for(const name of ['ALLOW_DEMO_AUTH','FORCE_DEMO_MODE']) {
    assert.match(compose,new RegExp("^    "+name+": 'false'\\r?$",'m'));
  }
  assert.match(compose,/^    DB_HOST: db\r?$/m);
  assert.match(compose,/^    DB_PORT: '3306'\r?$/m);
  assert.doesNotMatch(compose,/^\s*(?:env_file|NODE_OPTIONS|CYCLE_PAYWALL_SECRET):/m);
});

test('Docker secrets and browser origin require explicit operator values',()=>{
  for(const name of ['DB_USER','DB_PASSWORD','DB_NAME','ID_PEPPER','JWT_SECRET','MFA_ENCRYPTION_KEY','FRONTEND_ORIGIN']) {
    assert.ok(compose.includes(name+': ${'+name+':?'),name+' must not have a fallback');
  }
  assert.ok(compose.includes('MYSQL_ROOT_PASSWORD: ${MARIADB_ROOT_PASSWORD:?'));
  assert.doesNotMatch(compose,/^\s*-\s*[^\r\n]*\.env(?::|\s*$)/m);
});

test('Docker application waits for healthy MariaDB and successful schema bootstrap',()=>{
  assert.match(compose,/image: mariadb:/);
  assert.match(compose,/command: \[sh, -c, 'npm run migrate && npm run bootstrap'\]/);
  assert.match(compose,/db:\r?\n\s+condition: service_healthy/);
  assert.match(compose,/migrate:\r?\n\s+condition: service_completed_successfully/);
  assert.match(compose,/mariadb_data:\/var\/lib\/mysql/);
  assert.doesNotMatch(compose,/backend_data:\/usr\/src\/app\/data/);
  assert.match(compose,/backend_uploads:\/usr\/src\/app\/uploads/);
});
