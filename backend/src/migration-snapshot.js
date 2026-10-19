import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import path from 'node:path';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function snapshotPath(root, relative) {
  const normalized = String(relative).replaceAll('\\','/');
  if (!normalized || path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(part => !part || part === '..' || part === '.')) throw Error('Unsafe snapshot path.');
  const resolvedRoot = realpathSync(root);
  const result = realpathSync(path.join(resolvedRoot,normalized));
  const inside = path.relative(resolvedRoot,result);
  if (inside.startsWith('..') || path.isAbsolute(inside)) throw Error('Snapshot path escapes backup.');
  return result;
}
export function databaseEligible(relative) {
  const p = relative.replaceAll('\\','/');
  // Runtime encryption keys and environment credentials remain only in protected host backups.
  return /^backend\/data\/[^/]+\.(json|sqlite(?:-wal|-shm)?)$/.test(p) || /^(backend\/)?uploads\//.test(p);
}
export function stateRecords(state) {
  return Object.entries(state).flatMap(([collection,value]) => (Array.isArray(value) ? value : [value]).map((record,ordinal) => {
    const payload = JSON.stringify(record);
    return {collection,ordinal,payload,sha256:digest(payload)};
  }));
}
export function loadSnapshot(root) {
  const manifest = JSON.parse(readFileSync(snapshotPath(root,'manifest.json'),'utf8'));
  if (!Array.isArray(manifest.files) || !manifest.createdAt) throw Error('Backup manifest is missing.');
  const files = [];
  const names = new Set();
  for (const entry of manifest.files) {
    const relative = entry.file.replaceAll('\\','/');
    if (names.has(relative)) throw Error('Duplicate backup path.');
    names.add(relative);
    if (!databaseEligible(relative)) continue;
    const bytes = readFileSync(snapshotPath(root,relative));
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw Error('Backup integrity mismatch.');
    files.push({path:relative,bytes,sha256:entry.sha256});
  }
  const stateFile = files.find(file => file.path === 'backend/data/platform-store.json');
  if (!stateFile) throw Error('Platform data missing from backup.');
  const state = JSON.parse(stateFile.bytes.toString('utf8'));
  const users = new Set(state.users.map(user => String(user.id)));
  if (users.size !== state.users.length) throw Error('Duplicate user IDs require review.');
  if (state.memberCommunities.some(member => !users.has(String(member.memberId)))) throw Error('Membership references a missing user.');
  const records = stateRecords(state);
  const metadata = {createdAt:manifest.createdAt,files:files.map(file=>({path:file.path,bytes:file.bytes.length,sha256:file.sha256})),collections:Object.fromEntries(Object.entries(state).map(([key,value])=>[key,{array:Array.isArray(value),count:Array.isArray(value)?value.length:1}]))};
  return {id:digest(JSON.stringify(metadata)),metadata,files,records,state};
}

export async function verifySnapshot(connection,snapshot) {
  const [files] = await connection.execute('SELECT ordinal, source_path, byte_length, sha256 FROM duranki_migration_file WHERE run_id=? ORDER BY ordinal',[snapshot.id]);
  if (files.length !== snapshot.files.length) throw Error('SQL file count mismatch.');
  for (const [ordinal,file] of snapshot.files.entries()) {
    const stored = files[ordinal];
    if (stored.source_path !== file.path || Number(stored.byte_length) !== file.bytes.length || stored.sha256 !== file.sha256) throw Error('SQL file metadata mismatch.');
    const [chunks] = await connection.execute('SELECT chunk_ordinal, contents FROM duranki_migration_chunk WHERE run_id=? AND file_ordinal=? ORDER BY chunk_ordinal',[snapshot.id,ordinal]);
    if (chunks.some((row,index)=>row.chunk_ordinal!==index)) throw Error('SQL chunk sequence mismatch.');
    const restored = Buffer.concat(chunks.map(row=>row.contents));
    if (restored.length !== file.bytes.length || digest(restored) !== file.sha256) throw Error('SQL file round-trip mismatch.');
  }
  // MariaDB marks JSON_VALID text columns as JSON; cast prevents mysql2 parsing values before byte verification.
  const [rows] = await connection.execute('SELECT collection_name,ordinal,CAST(payload AS CHAR CHARACTER SET utf8mb4) AS payload,sha256 FROM duranki_migration_record WHERE run_id=?',[snapshot.id]);
  if (rows.length !== snapshot.records.length) throw Error('SQL record count mismatch.');
  const expected = new Map(snapshot.records.map(row=>[`${row.collection}:${row.ordinal}`,row]));
  for (const row of rows) {
    const source = expected.get(`${row.collection_name}:${row.ordinal}`);
    if (!source || source.payload!==row.payload || source.sha256!==row.sha256 || digest(row.payload)!==row.sha256) throw Error('SQL record round-trip mismatch.');
    expected.delete(`${row.collection_name}:${row.ordinal}`);
  }
  if (expected.size) throw Error('Missing SQL records.');
}

export async function migrateSnapshot(connection,snapshot) {
  await connection.beginTransaction();
  try {
    const [existing] = await connection.execute('SELECT status FROM duranki_migration_run WHERE id=? FOR UPDATE',[snapshot.id]);
    if (!existing.length) {
      await connection.execute('INSERT INTO duranki_migration_run(id,source_created_at,status,manifest_json) VALUES(?,?,?,?)',[snapshot.id,snapshot.metadata.createdAt,'STAGED',JSON.stringify(snapshot.metadata)]);
      for (const [ordinal,file] of snapshot.files.entries()) {
        await connection.execute('INSERT INTO duranki_migration_file(run_id,ordinal,source_path,byte_length,sha256) VALUES(?,?,?,?,?)',[snapshot.id,ordinal,file.path,file.bytes.length,file.sha256]);
        for (let offset=0,chunk=0;offset<file.bytes.length;offset+=512*1024,chunk++) {
          await connection.execute('INSERT INTO duranki_migration_chunk(run_id,file_ordinal,chunk_ordinal,contents) VALUES(?,?,?,?)',[snapshot.id,ordinal,chunk,file.bytes.subarray(offset,offset+512*1024)]);
        }
      }
      for (const row of snapshot.records) await connection.execute('INSERT INTO duranki_migration_record(run_id,collection_name,ordinal,payload,sha256) VALUES(?,?,?,?,?)',[snapshot.id,row.collection,row.ordinal,row.payload,row.sha256]);
    }
    await verifySnapshot(connection,snapshot);
    await connection.execute('UPDATE duranki_migration_run SET status=? WHERE id=?',['VERIFIED',snapshot.id]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}
