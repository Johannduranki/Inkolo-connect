import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {databaseEligible,digest,loadSnapshot,snapshotPath,stateRecords,migrateSnapshot} from '../src/migration-snapshot.js';

test('migration excludes environment credentials and encryption keys', () => {
  for (const file of ['backend/.env','.env','backend/data/mfa.key','backend/data/config.pem']) assert.equal(databaseEligible(file),false);
  for (const file of ['backend/data/platform-store.json','backend/data/cycle.sqlite-wal','backend/uploads/id.pdf']) assert.equal(databaseEligible(file),true);
});
test('record migration preserves unknown fields, array ordering and value types', () => {
  const state={users:[{id:3,roles:['Member','Platform Admin'],unknown:{value:null}}],enabled:false,empty:[],object:{amount:0}};
  const rows=stateRecords(state);
  assert.deepEqual(JSON.parse(rows[0].payload),state.users[0]);
  assert.equal(rows[1].payload,'false');
  assert.equal(rows[2].payload,'{"amount":0}');
  assert.equal(rows[0].sha256,digest(rows[0].payload));
});
test('backup loading rejects traversal, tampering and missing membership users', () => {
  const root=mkdtempSync(path.join(os.tmpdir(),'duranki-migration-test-'));
  try {
    mkdirSync(path.join(root,'backend/data'),{recursive:true});
    const state={users:[{id:1}],memberCommunities:[{memberId:2}]};
    const payload=Buffer.from(JSON.stringify(state));
    const file='backend/data/platform-store.json';
    writeFileSync(path.join(root,file),payload);
    writeFileSync(path.join(root,'manifest.json'),JSON.stringify({createdAt:'2026-10-15',files:[{file,bytes:payload.length,sha256:digest(payload)}]}));
    assert.throws(()=>loadSnapshot(root),/missing user/);
    for(const name of ['../other','C:/Windows/file','/etc/passwd','a/../b']) assert.throws(()=>snapshotPath(root,name));
    writeFileSync(path.join(root,file),'{}');
    assert.throws(()=>loadSnapshot(root),/integrity mismatch/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('SQL migration rolls back on verification failure without committing', async () => {
  const calls=[];
  const connection={beginTransaction:async()=>calls.push('begin'),rollback:async()=>calls.push('rollback'),commit:async()=>calls.push('commit'),execute:async sql=>{
    calls.push(sql.split(' ')[0]);
    if(sql.startsWith('SELECT ordinal'))return [[{ordinal:0}]];
    return [[]];
  }};
  await assert.rejects(migrateSnapshot(connection,{id:'x',metadata:{createdAt:'today'},files:[],records:[]}),/count mismatch/);
  assert.equal(calls.at(-1),'rollback');
  assert.equal(calls.includes('commit'),false);
});
