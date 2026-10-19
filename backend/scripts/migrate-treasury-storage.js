import 'dotenv/config';
import mysql from 'mysql2/promise';
import {DatabaseSync} from 'node:sqlite';
import {digest,snapshotPath} from '../src/migration-snapshot.js';

let connection, source;
try {
  if (!process.argv.includes('--api-stopped')) throw Error('Pause Treasury writers before migration.');
  source = new DatabaseSync(snapshotPath(process.argv[2],'validation/treasury.sqlite'),{readOnly:true});
  if (source.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || source.prepare('PRAGMA foreign_key_check').all().length) throw Error('Source integrity check failed.');
  const plans = [
    ['scope',['id','tenant_id','tenant_name','community_id','community_name']],
    ['party',['id','name','service_id','beneficiary_reference','share_bps']],
    ['receipt',['id','scope_id','party_id','user_id','member_name','reference','received_cents','payable_cents','share_bps','received_on','created_by','created_at']],
    ['payment',['id','party_id','status','created_by','approved_by','bank_reference','settled_by','created_at','settled_on']],
    ['payment_line',['receipt_id','payment_id']],
    ['staff',['user_id','role','password_hash','version']],
    ['audit',['id','actor','action','record_id','created_at']]
  ].map(([table,columns]) => ({table,columns,rows:source.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY ${columns[0]}`).all()}));
  const fingerprint = digest(JSON.stringify(plans));
  connection = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  await connection.beginTransaction();
  try {
    const [[existing]] = await connection.query('SELECT source_sha256 FROM duranki_treasury_migration WHERE id=1 FOR UPDATE');
    if (existing && existing.source_sha256 !== fingerprint) throw Error('A different Treasury migration already exists.');
    const counts = {};
    for (const plan of plans) {
      const table = `duranki_treasury_${plan.table}`;
      const [[before]] = await connection.query(`SELECT COUNT(*) AS n FROM ${table}`);
      if (!existing && Number(before.n)) throw Error('Destination is not empty.');
      if (!existing) for (const row of plan.rows) await connection.execute(`INSERT INTO ${table}(${plan.columns.join(',')}) VALUES(${plan.columns.map(()=>'?').join(',')})`,plan.columns.map(column=>row[column]));
      const [rows] = await connection.query(`SELECT ${plan.columns.join(',')} FROM ${table}`);
      const canonical = rows => rows.map(row=>JSON.stringify(plan.columns.map(column=>row[column]))).sort();
      if (JSON.stringify(canonical(rows)) !== JSON.stringify(canonical(plan.rows))) throw Error('Treasury row verification failed.');
      counts[table] = rows.length;
    }
    if (!existing) await connection.execute('INSERT INTO duranki_treasury_migration(id,source_sha256,counts_json) VALUES(1,?,?)',[fingerprint,JSON.stringify(counts)]);
    await connection.commit();
    console.log(JSON.stringify({status:'TREASURY_MIGRATION_VERIFIED',counts,sourceFilesUnchanged:true}));
  } catch (error) { await connection.rollback(); throw error; }
} catch (error) {
  console.error(JSON.stringify({status:'TREASURY_MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));
  process.exitCode = 1;
} finally { source?.close(); await connection?.end(); }
