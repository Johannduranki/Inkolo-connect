import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const snapshotKind = 'duranki-sql-table-snapshot-v2';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const identifier = value => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw Error('Unsafe SQL identifier.');
  return '`' + value + '`';
};
const encode = value => Buffer.isBuffer(value) ? { kind: 'binary', value: value.toString('base64') }
  : value && typeof value === 'object' ? { kind: 'json', value } : value;
const decode = value => value && typeof value === 'object'
  ? value.kind === 'binary' ? Buffer.from(value.value, 'base64') : JSON.stringify(value.value) : value;
const rowDigest = rows => hash(JSON.stringify(rows.map(row => JSON.stringify(row)).sort()));

export async function tableSnapshot(connection, name) {
  const [definition] = await connection.query('SHOW CREATE TABLE ' + identifier(name));
  const [columns] = await connection.query('SHOW FULL COLUMNS FROM ' + identifier(name));
  const [raw] = await connection.query({ sql: 'SELECT * FROM ' + identifier(name), rowsAsArray: true });
  const rows = raw.map(row => row.map(encode));
  return { name, schema: definition[0]['Create Table'],
    columns: columns.map(column => ({ name: column.Field, generated: /(?:VIRTUAL|STORED|PERSISTENT) GENERATED/.test(column.Extra) })),
    rows, sha256: rowDigest(rows) };
}

export async function captureDatabase(connection) {
  const [tables] = await connection.query("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  if (!tables.length || tables.some(table => table.engine !== 'InnoDB')) throw Error('Consistent snapshot requires only InnoDB tables.');
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  try {
    const snapshot = { kind: snapshotKind, createdAt: new Date().toISOString(), tables: [] };
    for (const { name } of tables) snapshot.tables.push(await tableSnapshot(connection, name));
    await connection.commit();
    return snapshot;
  } catch (error) { await connection.rollback(); throw error; }
}

export function sealSnapshot(snapshot, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(snapshotKind));
  const ciphertext = Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))), cipher.final()]);
  return Buffer.from(JSON.stringify({ kind: snapshotKind, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
}

export function openSnapshot(bytes, key) {
  const envelope = JSON.parse(bytes);
  if (envelope.kind !== snapshotKind) throw Error('Unsupported snapshot.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(snapshotKind));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  const snapshot = JSON.parse(gunzipSync(plaintext));
  if (snapshot.kind !== snapshotKind) throw Error('Unsupported snapshot.');
  for (const table of snapshot.tables) {
    identifier(table.name);
    if (rowDigest(table.rows) !== table.sha256) throw Error('Snapshot rows failed validation.');
  }
  return snapshot;
}

export async function restoreTables(connection, snapshot) {
  // Caller supplies a new, empty database on the separately verified restore instance.
  const [existing] = await connection.query('SHOW TABLES');
  if (existing.length) throw Error('Restore destination must be empty.');
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  try {
    for (const table of snapshot.tables) await connection.query(table.schema);
    for (const table of snapshot.tables) {
      const positions = table.columns.flatMap((column, index) => column.generated ? [] : [index]);
      const columns = positions.map(index => identifier(table.columns[index].name));
      const sql = `INSERT INTO ${identifier(table.name)} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      for (const row of table.rows) await connection.execute(sql, positions.map(index => decode(row[index])));
    }
  } finally { await connection.query('SET FOREIGN_KEY_CHECKS=1'); }
  const verified = [];
  for (const table of snapshot.tables) {
    const actual = await tableSnapshot(connection, table.name);
    if (actual.rows.length !== table.rows.length || actual.sha256 !== table.sha256 || actual.schema !== table.schema) throw Error('Restored table differs from the encrypted snapshot.');
    verified.push({ name: table.name, rows: table.rows.length, sha256: table.sha256 });
  }
  return verified;
}
