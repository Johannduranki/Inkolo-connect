import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { activeMigrationFiles, applySchemaMigration } from '../src/schema-migration.js';

const databaseName = process.env.DB_NAME;

if (!/^[A-Za-z0-9_]+$/.test(databaseName ?? '')) {
  throw new Error('DB_NAME must contain only letters, numbers, and underscores.');
}

const databaseDirectory = path.resolve('database');
const migrationFiles = activeMigrationFiles(await readdir(databaseDirectory));

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
});

try {
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  await connection.query(`USE \`${databaseName}\``);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of migrationFiles) {
    const source = await readFile(path.join(databaseDirectory, file), 'utf8');
    const sql = source.replaceAll('duranki_login', databaseName);
    if (await applySchemaMigration(connection,file,sql)) console.log(`Applied database migration ${file}`);
  }
} catch(error) {
  console.error(JSON.stringify({status:'MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'UNKNOWN'}));
  process.exitCode=1;
} finally {
  await connection.end();
}
